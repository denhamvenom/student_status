import { RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation, mutation } from "./_generated/server";
import { requireRole, viewer } from "./lib/access";
import { ADMIN_CONTACT_DETAILS_MAX, ADMIN_CONTACT_EMAIL, adminContactTopicLabels, adminContactTopicValidator, type AdminContactTopic } from "./lib/adminContact";
import { parentInviteEmailConfiguration } from "./lib/parentInviteEmail";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000];
const limiter = new RateLimiter(components.rateLimiter, {
  adminContactHourly: { kind: "fixed window", rate: 3, period: 60 * 60 * 1000 },
  adminContactDaily: { kind: "fixed window", rate: 10, period: 24 * 60 * 60 * 1000 },
});
const EMAIL = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;

/**
 * A Coach asks the administrator for help with a setup limit. Only Coaches can reach
 * the errors that offer this, so only Coaches may send it. No student data is sent.
 */
export const request = mutation({
  args: { topic: adminContactTopicValidator, details: v.optional(v.string()) },
  returns: v.object({ status: v.union(v.literal("queued"), v.literal("notSent"), v.literal("tooManyRequests")) }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    const details = args.details?.trim() || undefined;
    if (details && details.length > ADMIN_CONTACT_DETAILS_MAX) throw new ConvexError(`Keep the details to ${ADMIN_CONTACT_DETAILS_MAX} characters or fewer, then try again.`);
    const key = actor._id;
    const [hourly, daily] = await Promise.all([limiter.check(ctx, "adminContactHourly", { key }), limiter.check(ctx, "adminContactDaily", { key })]);
    if (!hourly.ok || !daily.ok) return { status: "tooManyRequests" as const };
    await limiter.limit(ctx, "adminContactHourly", { key });
    await limiter.limit(ctx, "adminContactDaily", { key });
    const configured = parentInviteEmailConfiguration() !== null;
    const requestId = await ctx.db.insert("adminContactRequests", { requestedBy: actor._id, topic: args.topic, details, createdAt: Date.now(), emailStatus: configured ? "queued" : "notSent", emailAttempt: 0 });
    if (!configured) return { status: "notSent" as const };
    await ctx.scheduler.runAfter(0, internal.adminContact.send, { requestId, attempt: 1 });
    await ctx.scheduler.runAfter(20 * 60_000, internal.adminContact.markStalled, { requestId });
    return { status: "queued" as const };
  },
});

export const markStalled = internalMutation({
  args: { requestId: v.id("adminContactRequests") }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.requestId);
    if (row?.emailStatus === "queued") await ctx.db.patch(row._id, { emailStatus: "failed" });
    return null;
  },
});

const ready = v.object({ topic: adminContactTopicValidator, details: v.union(v.string(), v.null()), name: v.string(), email: v.string(), createdAt: v.number() });

export const prepareSend = internalMutation({
  args: { requestId: v.id("adminContactRequests"), attempt: v.number() },
  returns: v.union(ready, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.requestId);
    if (!row || row.emailStatus !== "queued" || args.attempt < 1 || args.attempt > MAX_ATTEMPTS || (row.emailAttempt ?? 0) >= args.attempt) return null;
    const requester = await ctx.db.get(row.requestedBy);
    if (!requester?.active || requester.role !== "coach") {
      await ctx.db.patch(row._id, { emailStatus: "notSent" });
      return null;
    }
    await ctx.db.patch(row._id, { emailAttempt: args.attempt });
    return { topic: row.topic, details: row.details ?? null, name: requester.name, email: requester.email, createdAt: row.createdAt };
  },
});

export const finishSend = internalMutation({
  args: { requestId: v.id("adminContactRequests"), attempt: v.number(), outcome: v.union(v.literal("sent"), v.literal("retry"), v.literal("failed"), v.literal("notSent")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.requestId);
    if (!row || row.emailStatus !== "queued" || row.emailAttempt !== args.attempt) return null;
    if (args.outcome === "sent") await ctx.db.patch(row._id, { emailStatus: "sent", emailSentAt: Date.now() });
    else if (args.outcome === "retry" && args.attempt < MAX_ATTEMPTS) await ctx.scheduler.runAfter(RETRY_DELAYS_MS[args.attempt - 1], internal.adminContact.send, { requestId: args.requestId, attempt: args.attempt + 1 });
    else await ctx.db.patch(row._id, { emailStatus: args.outcome === "notSent" ? "notSent" : "failed" });
    return null;
  },
});

function centralTime(at: number) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(at));
}

/** Plain-text message for the administrator. Only the Coach's own account details are included. */
export function adminContactEmail(request: { topic: AdminContactTopic; details: string | null; name: string; email: string; createdAt: number }) {
  const topic = adminContactTopicLabels[request.topic];
  const lines = [
    "A Coach asked for help in Venom Status.",
    "",
    `Problem: ${topic}`,
    `From: ${request.name} (Coach)`,
    `Email: ${request.email}`,
    `Sent: ${centralTime(request.createdAt)}`,
    ...(request.details ? ["", "Details from the Coach:", request.details] : []),
    "",
    "Reply to this email to answer the Coach.",
  ];
  return { subject: `Venom Status: Coach needs help — ${topic}`, text: lines.join("\n") };
}

export const send = internalAction({
  args: { requestId: v.id("adminContactRequests"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request: { topic: AdminContactTopic; details: string | null; name: string; email: string; createdAt: number } | null = await ctx.runMutation(internal.adminContact.prepareSend, args);
    if (!request) return null;
    const config = parentInviteEmailConfiguration();
    if (!config) {
      await ctx.runMutation(internal.adminContact.finishSend, { ...args, outcome: "notSent" });
      return null;
    }
    const replyTo = EMAIL.test(request.email) ? request.email : config.replyTo;
    // Keep payload identical across retries; Resend deduplicates this request ID for 24 hours.
    const payload = JSON.stringify({ from: config.from, reply_to: replyTo, to: [ADMIN_CONTACT_EMAIL], ...adminContactEmail(request) });
    let outcome: "sent" | "retry" | "failed";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `admin-contact/${args.requestId}` },
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
    await ctx.runMutation(internal.adminContact.finishSend, { ...args, outcome });
    return null;
  },
});
