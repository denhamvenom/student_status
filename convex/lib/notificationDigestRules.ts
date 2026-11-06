import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { MAX_DIGEST_USERS } from "./digest";
import { MAX_BODY, MAX_TITLE } from "./notify";

/**
 * Mentor digest items (M4 new event the Mentor can sign up for, M5 activity on a meeting the Mentor created). They use the
 * Mentor-only "mentorEvents" preference category ("Meetings and events"), separate from Staff to-dos: turning it off stops
 * exactly these, and the Staff setting no longer affects them. Nothing is pushed at once; the 5 PM digest flush
 * (notificationDigest.ts) sends one summary push.
 * Same PII rule as lib/notify.ts: meeting names, dates and places only, never a person's name.
 */
export const MENTOR_DIGEST_LABELS: Record<MentorDigestKind, [string, string]> = {
  mentorMeetingOpen: ["new event you can join", "new events you can join"],
  mentorMeetingMentorJoined: ["Mentor signed up", "Mentors signed up"],
  mentorMeetingMentorLeft: ["Mentor dropped out", "Mentors dropped out"],
  mentorMeetingStudentJoined: ["student signed up", "students signed up"],
  mentorMeetingStudentLeft: ["student dropped out", "students dropped out"],
  mentorMeetingSignupPending: ["signup request to approve", "signup requests to approve"],
};
export type MentorDigestKind = "mentorMeetingOpen" | "mentorMeetingMentorJoined" | "mentorMeetingMentorLeft" | "mentorMeetingStudentJoined" | "mentorMeetingStudentLeft" | "mentorMeetingSignupPending";

export function isMentorDigestKind(kind: string): kind is MentorDigestKind {
  return Object.prototype.hasOwnProperty.call(MENTOR_DIGEST_LABELS, kind);
}

/** M5: what happened on a meeting the Mentor created. */
export type MeetingActivity = "mentorJoined" | "mentorLeft" | "studentJoined" | "studentLeft" | "signupPending";

export const MEETING_ACTIVITY: Record<MeetingActivity, { kind: MentorDigestKind; title: (name: string) => string; body: (day: string) => string }> = {
  mentorJoined: { kind: "mentorMeetingMentorJoined", title: name => `Mentor signed up: ${name}`, body: day => `A Mentor signed up for your meeting on ${day}. Open the meeting for details.` },
  mentorLeft: { kind: "mentorMeetingMentorLeft", title: name => `Mentor dropped out: ${name}`, body: day => `A Mentor dropped out of your meeting on ${day}. Open the meeting for details.` },
  studentJoined: { kind: "mentorMeetingStudentJoined", title: name => `Student signed up: ${name}`, body: day => `A student signed up for your meeting on ${day}. Open the meeting for details.` },
  studentLeft: { kind: "mentorMeetingStudentLeft", title: name => `Student dropped out: ${name}`, body: day => `A student dropped out of your meeting on ${day}. Open the meeting for details.` },
  signupPending: { kind: "mentorMeetingSignupPending", title: name => `Signup to approve: ${name}`, body: day => `A student signup for your meeting on ${day} is waiting for approval. Open the meeting to review it.` },
};

/** Digest summary for a tally made only of Mentor meeting kinds ("mentorEvents", or older "staff" items); null otherwise. */
export function mentorDigestSummary(kinds: [string, number][]): { title: string; body: string } | null {
  if (!kinds.length || !kinds.every(([kind]) => isMentorDigestKind(kind))) return null;
  const parts = kinds.map(([kind, count]) => `${count} ${count === 1 ? MENTOR_DIGEST_LABELS[kind as MentorDigestKind][0] : MENTOR_DIGEST_LABELS[kind as MentorDigestKind][1]}`);
  return { title: `Meetings: ${parts.join(", ")}`, body: "Open your Inbox for details." };
}

/**
 * Like lib/digest queueDigestItem for the "mentorEvents" category, plus an optional per-user `dedupeKey` (stored on the inbox
 * row, same `${userId}:${key}` form as notifyUsers) so a repeated trigger never queues the same item twice.
 * A user with "mentorEvents" turned off still gets the inbox row (pushStatus "skipped"), but no digest item.
 */
export async function queueMentorDigestItem(ctx: MutationCtx, args: { userIds: Id<"appUsers">[]; kind: MentorDigestKind; url: string; title: string; body: string; dedupeKey?: string }): Promise<number> {
  const title = args.title.trim().slice(0, MAX_TITLE), body = args.body.trim().slice(0, MAX_BODY);
  const now = Date.now();
  let queued = 0;
  for (const userId of [...new Set(args.userIds)].slice(0, MAX_DIGEST_USERS)) {
    const user = await ctx.db.get(userId);
    if (!user?.active) continue;
    const dedupeKey = args.dedupeKey === undefined ? undefined : `${userId}:${args.dedupeKey}`;
    if (dedupeKey && await ctx.db.query("notifications").withIndex("by_dedupeKey", q => q.eq("dedupeKey", dedupeKey)).first()) continue;
    const prefs = await ctx.db.query("notificationPreferences").withIndex("by_userId", q => q.eq("userId", userId)).unique();
    const disabled = prefs?.disabledCategories.includes("mentorEvents") ?? false;
    const notificationId = await ctx.db.insert("notifications", { userId, title, body, url: args.url, category: "mentorEvents", urgent: false, createdAt: now, pushStatus: disabled ? "skipped" : "digest", ...(dedupeKey ? { dedupeKey } : {}) });
    if (disabled) continue;
    await ctx.db.insert("notificationDigestItems", { userId, category: "mentorEvents", kind: args.kind, url: args.url, notificationId, createdAt: now });
    queued++;
  }
  return queued;
}
