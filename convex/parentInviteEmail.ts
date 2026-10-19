import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { tokenHash } from "./lib/invitationIdentity";
import { parentInviteEmailConfiguration } from "./lib/parentInviteEmail";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000];

export const markStalled = internalMutation({
  args: { inviteId: v.id("parentInvitations") }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.inviteId);
    if (row?.emailStatus === "queued") await ctx.db.patch(row._id, {
      emailStatus: "failed", emailError: "Email status could not be confirmed. Share the link directly.",
    });
    return null;
  },
});

export const prepareSend = internalMutation({
  args: { inviteId: v.id("parentInvitations"), hash: v.string(), attempt: v.number() },
  returns: v.union(v.object({ parentEmail: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.inviteId);
    if (!row || row.emailStatus !== "queued" || row.tokenHash !== args.hash ||
        row.status !== "pending" || row.expiresAt <= Date.now() ||
        args.attempt < 1 || args.attempt > MAX_ATTEMPTS || (row.emailAttempt ?? 0) >= args.attempt) {
      if (row?.emailStatus === "queued" && (row.status !== "pending" || row.expiresAt <= Date.now())) {
        await ctx.db.patch(row._id, { emailStatus: "not_sent", emailError: "Invitation is no longer active." });
      }
      return null;
    }
    const student = await ctx.db.get(row.studentId);
    const season = student && await ctx.db.get(student.seasonId);
    if (!student?.active || !season || season.status !== "active") {
      await ctx.db.patch(row._id, { emailStatus: "not_sent", emailError: "Invitation is no longer active." });
      return null;
    }
    await ctx.db.patch(row._id, { emailAttempt: args.attempt });
    return { parentEmail: row.parentEmail };
  },
});

export const finishSend = internalMutation({
  args: { inviteId: v.id("parentInvitations"), token: v.string(), attempt: v.number(), outcome: v.union(v.literal("sent"), v.literal("retry"), v.literal("failed"), v.literal("not_sent")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.inviteId);
    if (!row || row.tokenHash !== await tokenHash(args.token) || row.emailStatus !== "queued" || row.emailAttempt !== args.attempt) return null;
    if (args.outcome === "sent") {
      await ctx.db.patch(row._id, { emailStatus: "sent", emailError: undefined, emailSentAt: Date.now() });
    } else if (args.outcome === "retry" && args.attempt < MAX_ATTEMPTS && row.status === "pending" && row.expiresAt > Date.now()) {
      await ctx.db.patch(row._id, { emailError: "Email is delayed. Retrying automatically." });
      await ctx.scheduler.runAfter(RETRY_DELAYS_MS[args.attempt - 1], internal.parentInviteEmail.send, { inviteId: args.inviteId, token: args.token, attempt: args.attempt + 1 });
    } else {
      await ctx.db.patch(row._id, { emailStatus: args.outcome === "not_sent" || row.status !== "pending" || row.expiresAt <= Date.now() ? "not_sent" : "failed", emailError: args.outcome === "not_sent" ? "Automatic email is not configured. Share the link directly." : "Email could not be sent. Share the link directly." });
    }
    return null;
  },
});

export const send = internalAction({
  args: { inviteId: v.id("parentInvitations"), token: v.string(), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hash = await tokenHash(args.token);
    const ready: { parentEmail: string } | null = await ctx.runMutation(internal.parentInviteEmail.prepareSend, { inviteId: args.inviteId, hash, attempt: args.attempt });
    if (!ready) return null;
    const config = parentInviteEmailConfiguration();
    if (!config) {
      await ctx.runMutation(internal.parentInviteEmail.finishSend, { ...args, outcome: "not_sent" });
      return null;
    }
    const link = `${config.origin}/invite-parent#token=${encodeURIComponent(args.token)}`;
    // Keep payload identical across retries; Resend deduplicates this invite ID for 24 hours.
    const payload = JSON.stringify({
      from: config.from,
      reply_to: config.replyTo,
      to: [ready.parentEmail],
      subject: "Invitation to Denham Venom Student Status",
      text: `You have been invited to connect your Google account to Denham Venom Student Status. Open this link to review the invitation: ${link}\n\nSign in with the Google account for ${ready.parentEmail}. The invitation expires in 7 days and can be used once. If you were not expecting this invitation, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#172431"><h1>Parent invitation</h1><p>You have been invited to connect your Google account to Denham Venom Student Status.</p><p><a href="${link}" style="display:inline-block;background:#165d75;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Open invitation</a></p><p>Sign in with the Google account that received this email. The invitation expires in 7 days and can be used once.</p><p>If you were not expecting this invitation, you can ignore this email.</p></div>`,
    });
    let outcome: "sent" | "retry" | "failed";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `parent-invite/${args.inviteId}` },
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
    await ctx.runMutation(internal.parentInviteEmail.finishSend, { ...args, outcome });
    return null;
  },
});
