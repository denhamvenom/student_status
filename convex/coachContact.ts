import { RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, mutation } from "./_generated/server";
import { viewer } from "./lib/access";
import { parentInviteEmailConfiguration } from "./lib/parentInviteEmail";

/**
 * "Ask a Coach": a signed-in Parent, Student or Mentor sends a short message to the Coaches' shared inbox.
 * Coaches and Travel Leads already have the Coach tools, so they are refused. The recipient is fixed here, never client-supplied.
 * The message is emailed and not kept in app tables. Convex keeps the completed scheduled-send record (with the message) for about a week.
 */
export const COACH_CONTACT_EMAIL = "coach@team8044.org";
export const COACH_CONTACT_MESSAGE_MAX = 1000;
export const COACH_CONTACT_ROLES = ["parent", "student", "mentor"] as const;

export const coachContactTopicValidator = v.union(v.literal("eventsTravel"), v.literal("money"), v.literal("forms"), v.literal("other"));
export type CoachContactTopic = "eventsTravel" | "money" | "forms" | "other";
export const coachContactTopicLabels: Record<CoachContactTopic, string> = {
  eventsTravel: "Events and travel",
  money: "Money",
  forms: "Forms",
  other: "Something else",
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000];
const limiter = new RateLimiter(components.rateLimiter, {
  coachContactHourly: { kind: "fixed window", rate: 3, period: 60 * 60 * 1000 },
  coachContactDaily: { kind: "fixed window", rate: 10, period: 24 * 60 * 60 * 1000 },
});
const EMAIL = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
const ROLE_LABEL = { parent: "Parent", student: "Student", mentor: "Mentor" } as const;

const sendArgs = {
  topic: coachContactTopicValidator, message: v.string(), name: v.string(), email: v.string(),
  role: v.union(v.literal("parent"), v.literal("student"), v.literal("mentor")),
  students: v.array(v.string()), sentAt: v.number(), key: v.string(),
};

/** Names only (never health, money or contact details) of the students this account already has access to. */
async function studentNames(ctx: Parameters<typeof viewer>[0], user: Awaited<ReturnType<typeof viewer>>) {
  const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
  if (!season) return [];
  if (user.role === "student") {
    const own = await ctx.db.query("students").withIndex("by_seasonId_and_userId", q => q.eq("seasonId", season._id).eq("userId", user._id)).unique();
    return own?.active ? [own.preferredName] : [];
  }
  if (user.role !== "parent") return [];
  const links = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", user._id)).take(20);
  const names: string[] = [];
  for (const link of links) {
    if (!link.active) continue;
    const student = await ctx.db.get(link.studentId);
    if (student?.active && student.seasonId === season._id) names.push(student.preferredName);
  }
  return names;
}

export const send = mutation({
  args: { topic: coachContactTopicValidator, message: v.string() },
  returns: v.object({ status: v.union(v.literal("queued"), v.literal("notSent"), v.literal("tooManyRequests")) }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    if (!(COACH_CONTACT_ROLES as readonly string[]).includes(actor.role) || actor.travelLead) throw new ConvexError("Coaches and Travel Leads can't use Ask a Coach. Email a Coach or use the Coach tools instead.");
    const message = args.message.trim();
    if (!message) throw new ConvexError("Write a message first, then send it.");
    if (message.length > COACH_CONTACT_MESSAGE_MAX) throw new ConvexError(`Keep your message to ${COACH_CONTACT_MESSAGE_MAX} characters or fewer, then send it again.`);
    // Check email setup first so an unconfigured deployment never spends the sender's limit on a message that can't go out.
    if (parentInviteEmailConfiguration() === null) return { status: "notSent" as const };
    const key = actor._id;
    const [hourly, daily] = await Promise.all([limiter.check(ctx, "coachContactHourly", { key }), limiter.check(ctx, "coachContactDaily", { key })]);
    if (!hourly.ok || !daily.ok) return { status: "tooManyRequests" as const };
    await limiter.limit(ctx, "coachContactHourly", { key });
    await limiter.limit(ctx, "coachContactDaily", { key });
    const role = actor.role as "parent" | "student" | "mentor";
    await ctx.scheduler.runAfter(0, internal.coachContact.deliver, {
      topic: args.topic, message, name: actor.name, email: actor.email, role,
      students: await studentNames(ctx, actor), sentAt: Date.now(), key: crypto.randomUUID(), accountId: actor._id, attempt: 1,
    });
    return { status: "queued" as const };
  },
});

function centralTime(at: number) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(at));
}

/** Plain-text email to the Coaches. Only the sender's own account details and student names are included. */
export function coachContactEmail(input: { topic: CoachContactTopic; message: string; name: string; email: string; role: keyof typeof ROLE_LABEL; students: string[]; sentAt: number }) {
  const topic = coachContactTopicLabels[input.topic];
  const lines = [
    "Someone asked a Coach for help in Venom Status.",
    "",
    `Topic: ${topic}`,
    `From: ${input.name} (${ROLE_LABEL[input.role]})`,
    `Email: ${input.email}`,
    ...(input.students.length ? [`Students: ${input.students.join(", ")}`] : []),
    `Sent: ${centralTime(input.sentAt)}`,
    "",
    "Message:",
    input.message,
    "",
    "Reply to this email to answer them.",
  ];
  return { subject: `Venom Status: Ask a Coach — ${topic}`, text: lines.join("\n") };
}

/** Log line for a message that could not be delivered. Account id and attempt only: never the message, name, email or students. */
export function coachContactFailureLog(outcome: "retry" | "failed", attempt: number, accountId: string) {
  return `Ask a Coach message not delivered (${outcome === "failed" ? "rejected by the email service" : `still failing after ${attempt} attempts`}). Account ${accountId}.`;
}

export const deliver = internalAction({
  args: { ...sendArgs, accountId: v.string(), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { attempt, key, accountId: _accountId, ...content } = args;
    const config = parentInviteEmailConfiguration();
    if (!config) return null;
    const replyTo = EMAIL.test(content.email) ? content.email : config.replyTo;
    let outcome: "sent" | "retry" | "failed";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `coach-contact/${key}` },
        body: JSON.stringify({ from: config.from, reply_to: replyTo, to: [COACH_CONTACT_EMAIL], ...coachContactEmail(content) }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        const body: unknown = await response.json();
        outcome = body && typeof body === "object" && "id" in body && typeof body.id === "string" ? "sent" : "retry";
      } else outcome = response.status === 409 || response.status === 429 || response.status >= 500 ? "retry" : "failed";
    } catch { outcome = "retry"; }
    if (outcome === "retry" && attempt < MAX_ATTEMPTS) await ctx.scheduler.runAfter(RETRY_DELAYS_MS[attempt - 1], internal.coachContact.deliver, { ...args, attempt: attempt + 1 });
    else if (outcome !== "sent") console.error(coachContactFailureLog(outcome, attempt, args.accountId));
    return null;
  },
});
