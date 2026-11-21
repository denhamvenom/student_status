import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { adultInviteTokenVersion, jobHash, jobToken } from "./lib/inviteToken";
import { parentInviteEmailConfiguration } from "./lib/parentInviteEmail";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000];
// A job names its invite link by hash (derived links) or, for legacy and no-secret jobs, by the raw token.
const jobRef = { token: v.optional(v.string()), hash: v.optional(v.string()) };
const jobRefOf = (args: { token?: string; hash?: string }) => args.token !== undefined ? { token: args.token } : { hash: args.hash };

type OfferedRole = "Coach" | "Mentor" | "Travel Lead";
function offeredRole(row: { role: "coach" | "mentor"; travelLead: boolean }): OfferedRole {
  return row.role === "coach" ? "Coach" : row.travelLead ? "Travel Lead" : "Mentor";
}

// Each role gets its own subject and heading so it never reads like the parent invitation.
function adultInvitationEmail(role: OfferedRole, link: string) {
  const offer = `You have been invited to join Venom Status, the Denham Venom team app, as a ${role}.`;
  const steps = "Choose Open private invitation, sign in with Google or an email code sent to this address, then accept the invitation. This invitation expires in 7 days.";
  const ignore = "If you were not expecting this invitation, you can ignore this email.";
  return {
    subject: `${role} invitation to Venom Status`,
    text: `${offer}\n\nOpen this private link, sign in with Google or an email code sent to this address, then accept the invitation: ${link}\n\nThis invitation expires in 7 days.\n\n${ignore}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#172431"><h1>${role} invitation</h1><p>${offer}</p><p><a href="${link}" style="display:inline-block;background:#f5c400;color:#211432;padding:12px 18px;text-decoration:none;border-radius:6px">Open private invitation</a></p><p>${steps}</p><p>${ignore}</p></div>`,
  };
}

// Marks "failed" only because no result arrived; a confirmed delivery for the same attempt may still correct it.
const STALLED_ERROR = "We couldn't confirm the invitation email was sent. Check the address, then resend the invitation.";

export const markStalled = internalMutation({
  args: { inviteId: v.id("adultInvitations"), hash: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.inviteId);
    if (row?.emailStatus === "queued" && row.tokenHash === args.hash) await ctx.db.patch(row._id, {
      emailStatus: "failed", emailError: STALLED_ERROR,
    });
    return null;
  },
});

export const prepareSend = internalMutation({
  args: { inviteId: v.id("adultInvitations"), hash: v.string(), attempt: v.number() },
  returns: v.union(v.object({ email: v.string(), role: v.union(v.literal("Coach"), v.literal("Mentor"), v.literal("Travel Lead")), tokenVersion: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.inviteId);
    if (!row || row.emailStatus !== "queued" || row.tokenHash !== args.hash ||
        row.status !== "pending" || row.expiresAt <= Date.now() ||
        args.attempt < 1 || args.attempt > MAX_ATTEMPTS || (row.emailAttempt ?? 0) >= args.attempt) {
      if (row?.emailStatus === "queued" && (row.status !== "pending" || row.expiresAt <= Date.now())) {
        await ctx.db.patch(row._id, { emailStatus: "not_sent", emailError: "This invitation is no longer active, so the email was not sent. Send a new invitation if it's still needed." });
      }
      return null;
    }
    const issuer = await ctx.db.get(row.createdBy);
    const account = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", row.email)).take(1);
    if (!issuer?.active || issuer.role !== "coach" || account.length) {
      await ctx.db.patch(row._id, { emailStatus: "not_sent", emailError: "This invitation is no longer active, so the email was not sent. Send a new invitation if it's still needed." });
      return null;
    }
    await ctx.db.patch(row._id, { emailAttempt: args.attempt });
    return { email: row.email, role: offeredRole(row), tokenVersion: adultInviteTokenVersion(row) };
  },
});

export const finishSend = internalMutation({
  args: { inviteId: v.id("adultInvitations"), ...jobRef, attempt: v.number(), outcome: v.union(v.literal("sent"), v.literal("retry"), v.literal("failed"), v.literal("not_sent")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.inviteId);
    // Wave 1 fencing: only the current issue (hash) and attempt may change the row.
    if (!row || row.tokenHash !== await jobHash(args) || row.emailAttempt !== args.attempt) return null;
    const stalled = row.emailStatus === "failed" && row.emailError === STALLED_ERROR;
    if (row.emailStatus !== "queued" && !(stalled && args.outcome === "sent")) return null;
    if (args.outcome === "sent") {
      await ctx.db.patch(row._id, { emailStatus: "sent", emailError: undefined, emailSentAt: Date.now() });
    } else if (args.outcome === "retry" && args.attempt < MAX_ATTEMPTS && row.status === "pending" && row.expiresAt > Date.now()) {
      await ctx.db.patch(row._id, { emailError: "The email is delayed. It will be sent again automatically." });
      await ctx.scheduler.runAfter(RETRY_DELAYS_MS[args.attempt - 1], internal.adultInviteEmail.send, { inviteId: args.inviteId, ...jobRefOf(args), attempt: args.attempt + 1 });
    } else {
      await ctx.db.patch(row._id, { emailStatus: args.outcome === "not_sent" || row.status !== "pending" || row.expiresAt <= Date.now() ? "not_sent" : "failed", emailError: args.outcome === "not_sent" ? "Automatic email is not configured. Ask a Coach for help." : "Email could not be sent. Ask a Coach for help." });
    }
    return null;
  },
});

export const send = internalAction({
  args: { inviteId: v.id("adultInvitations"), ...jobRef, attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hash = await jobHash(args);
    if (!hash) return null;
    const ready: { email: string; role: OfferedRole; tokenVersion: string } | null = await ctx.runMutation(internal.adultInviteEmail.prepareSend, { inviteId: args.inviteId, hash, attempt: args.attempt });
    if (!ready) return null;
    const config = parentInviteEmailConfiguration();
    if (!config) {
      await ctx.runMutation(internal.adultInviteEmail.finishSend, { inviteId: args.inviteId, ...jobRefOf(args), attempt: args.attempt, outcome: "not_sent" });
      return null;
    }
    const token = await jobToken(args, "adult", args.inviteId, ready.tokenVersion, hash);
    if (!token) {
      await ctx.runMutation(internal.adultInviteEmail.finishSend, { inviteId: args.inviteId, ...jobRefOf(args), attempt: args.attempt, outcome: "failed" });
      return null;
    }
    const link = `${config.origin}/invite-adult#token=${encodeURIComponent(token)}`;
    // Keep payload identical across retries; Resend deduplicates this invite ID for 24 hours.
    const payload = JSON.stringify({
      from: config.from,
      reply_to: config.replyTo,
      to: [ready.email],
      ...adultInvitationEmail(ready.role, link),
    });
    let outcome: "sent" | "retry" | "failed";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `adult-invite/${args.inviteId}/${hash}` },
        body: payload,
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        const body: unknown = await response.json();
        outcome = body && typeof body === "object" && "id" in body && typeof body.id === "string" ? "sent" : "retry";
      } else {
        outcome = response.status === 429 || response.status >= 500 ? "retry" : "failed";
      }
    } catch { outcome = "retry"; }
    await ctx.runMutation(internal.adultInviteEmail.finishSend, { inviteId: args.inviteId, ...jobRefOf(args), attempt: args.attempt, outcome });
    return null;
  },
});
