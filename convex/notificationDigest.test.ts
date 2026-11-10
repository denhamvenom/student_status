/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { queueDigestItem, queueMoneyDigest } from "./lib/digest";
import { queueMentorMeetingActivityDigest, queueMentorMeetingOpenDigest } from "./lib/notificationTriggers";

const modules = import.meta.glob("./**/*.ts");
// Wed 2026-01-14 5:00 PM CST: digest hour, outside quiet hours.
const FLUSH_NOW = Date.parse("2026-01-14T23:00:00Z");
const flush = makeFunctionReference<"mutation", Record<string, never>, null>("notificationDigest:flush");
const hourly = makeFunctionReference<"mutation", Record<string, never>, null>("notificationDigest:hourly");
const queueTravel = makeFunctionReference<"mutation", { eventId: Id<"events">; cursor: string | null }, null>("notificationDigest:queueTravel");

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const account = async (key: string, role: Doc<"appUsers">["role"]) => {
      const authUserId = await ctx.db.insert("users", { email: `${key}@example.invalid` });
      return ctx.db.insert("appUsers", { authUserId, email: `${key}@example.invalid`, name: key, role, active: true, travelLead: false, financialEdit: false });
    };
    const coach = await account("coach", "coach");
    const parent = await account("parent", "parent");
    const quietParent = await account("quietparent", "parent");
    const studentUser = await account("student", "student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2027, status: "active", startsAt: 0, permissionVersion: "v1", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, userId: studentUser, legalName: "Synthetic Student", preferredName: "Syn", email: "student@example.invalid", subteam: "Build", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
    for (const parentUserId of [parent, quietParent]) await ctx.db.insert("familyLinks", { parentUserId, studentId: student, seasonId: season, active: true, createdBy: coach });
    await ctx.db.insert("notificationPreferences", { userId: quietParent, disabledCategories: ["money"], updatedAt: 0 });
    for (const userId of [parent, studentUser]) await ctx.db.insert("pushSubscriptions", { userId, endpoint: `https://fcm.googleapis.com/fcm/send/${userId}`, p256dh: "key", auth: "auth", deviceLabel: "Phone", createdAt: 0 });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Synthetic Regional", type: "Competition", startsAt: FLUSH_NOW + 10 * 86_400_000, endsAt: FLUSH_NOW + 11 * 86_400_000, destination: "Synthetic Arena", travel: "Charter Bus", overnight: true, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    await ctx.db.insert("participants", { eventId: event, studentId: student, status: "confirmed", createdAt: 0, updatedAt: 0 });
    return { coach, parent, quietParent, studentUser, student, event };
  });
  const sends = () => t.run(async ctx => (await ctx.db.system.query("_scheduled_functions").collect()).filter(job => job.name.includes("pushNode")).map(job => (job.args[0] as { payload: { title: string; body: string; url: string } }).payload));
  const inbox = (userId: Id<"appUsers">) => t.run(ctx => ctx.db.query("notifications").withIndex("by_userId_and_createdAt", q => q.eq("userId", userId)).collect());
  return { t, ids, sends, inbox };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(FLUSH_NOW);
  vi.stubEnv("VAPID_PUBLIC_KEY", "k"); vi.stubEnv("VAPID_PRIVATE_KEY", "k"); vi.stubEnv("VAPID_SUBJECT", "mailto:a@example.invalid");
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("notification digest", () => {
  it("writes inbox rows at once, then sends one push per category at the flush, once", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      await queueMoneyDigest(ctx, f.ids.student, "payment");
      await queueMoneyDigest(ctx, f.ids.student, "payment");
      await queueMoneyDigest(ctx, f.ids.student, "charge");
    });
    // Two transport edits coalesce into one travel item per person.
    await f.t.mutation(queueTravel, { eventId: f.ids.event, cursor: null });
    await f.t.mutation(queueTravel, { eventId: f.ids.event, cursor: null });

    const parentInbox = await f.inbox(f.ids.parent);
    expect(parentInbox.map(row => [row.category, row.pushStatus])).toEqual([["money", "digest"], ["money", "digest"], ["money", "digest"], ["travel", "digest"]]);
    expect(parentInbox.every(row => !/\$|\d/.test(row.title + row.body))).toBe(true);
    // Money disabled: inbox only, never queued for push.
    expect((await f.inbox(f.ids.quietParent)).map(row => [row.category, row.pushStatus])).toEqual([["money", "skipped"], ["money", "skipped"], ["money", "skipped"], ["travel", "digest"]]);
    expect(await f.sends()).toEqual([]);

    await f.t.mutation(flush, {});
    const sent = await f.sends();
    expect(sent).toHaveLength(3); // parent: money + travel; student: travel. The quiet parent has no device.
    expect(sent).toContainEqual(expect.objectContaining({ title: "Money: 3 updates", body: "2 payments received, 1 new charge. Open Money for details.", url: "/finances" }));
    expect(sent.filter(payload => payload.title === "Travel: transport details updated").map(payload => payload.url)).toEqual([`/events/${f.ids.event}`, `/events/${f.ids.event}`]);
    expect((await f.inbox(f.ids.quietParent)).at(-1)?.pushStatus).toBe("skipped");
    expect(await f.t.run(async ctx => (await ctx.db.query("notificationDigestItems").collect()).every(item => item.flushedAt === FLUSH_NOW))).toBe(true);

    await f.t.mutation(flush, {});
    expect(await f.sends()).toHaveLength(3);
  });

  it("a user with more items than one flush transaction gets every item stamped and exactly one push", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      await queueMoneyDigest(ctx, f.ids.student, "payment");
      const first = (await ctx.db.query("notificationDigestItems").withIndex("by_userId_and_flushedAt", q => q.eq("userId", f.ids.parent).eq("flushedAt", undefined)).first())!;
      for (let i = 0; i < 520; i++) await ctx.db.insert("notificationDigestItems", { userId: f.ids.parent, category: "money", kind: "charge", url: "/finances", notificationId: first.notificationId, createdAt: FLUSH_NOW });
    });
    // Run flush continuations by hand so the scheduled push sends are recorded, not executed.
    const ran = new Set<string>();
    await f.t.mutation(flush, {});
    for (let round = 0; round < 10; round++) {
      const jobs = await f.t.run(async ctx => (await ctx.db.system.query("_scheduled_functions").collect()).filter(job => job.name.endsWith("flush") && !ran.has(job._id)));
      if (!jobs.length) break;
      for (const job of jobs) { ran.add(job._id); await f.t.mutation(flush, job.args[0] as Record<string, never>); }
    }
    expect(ran.size).toBeGreaterThan(0);
    expect(await f.sends()).toEqual([expect.objectContaining({ title: "Money: 521 updates", body: "1 payment received, 520 new charges. Open Money for details." })]);
    expect(await f.t.run(async ctx => (await ctx.db.query("notificationDigestItems").collect()).every(item => item.flushedAt === FLUSH_NOW))).toBe(true);
  });

  it("coalesces a repeated transport edit even behind many other pending items", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let i = 0; i < 250; i++) await ctx.db.insert("notificationDigestItems", { userId: f.ids.parent, category: "money", kind: "charge", url: "/finances", createdAt: FLUSH_NOW });
    });
    await f.t.mutation(queueTravel, { eventId: f.ids.event, cursor: null });
    await f.t.mutation(queueTravel, { eventId: f.ids.event, cursor: null });
    const travel = await f.t.run(async ctx => (await ctx.db.query("notificationDigestItems").withIndex("by_userId_and_flushedAt", q => q.eq("userId", f.ids.parent).eq("flushedAt", undefined)).collect()).filter(item => item.kind === "transport"));
    expect(travel).toHaveLength(1);
  });

  it("summarises staff to-dos and only flushes during the 5 PM Chicago hour", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      await queueDigestItem(ctx, { userIds: [f.ids.coach], category: "staff", kind: "withdrawalRequest", url: "/withdrawals", inboxTitle: "Withdrawal request", inboxBody: "A withdrawal request needs review." });
      await queueDigestItem(ctx, { userIds: [f.ids.coach], category: "staff", kind: "signupPending", url: "/events", inboxTitle: "Signup to review", inboxBody: "A signup needs review." });
      await queueDigestItem(ctx, { userIds: [f.ids.coach], category: "staff", kind: "signupPending", url: "/events", inboxTitle: "Signup to review", inboxBody: "A signup needs review." });
      await ctx.db.insert("pushSubscriptions", { userId: f.ids.coach, endpoint: "https://fcm.googleapis.com/fcm/send/coach", p256dh: "key", auth: "auth", deviceLabel: "Phone", createdAt: 0 });
    });
    vi.setSystemTime(FLUSH_NOW - 60 * 60 * 1000);
    await f.t.mutation(hourly, {});
    expect(await f.t.run(async ctx => (await ctx.db.system.query("_scheduled_functions").collect()).filter(job => job.name.includes("flush")).length)).toBe(0);
    vi.setSystemTime(FLUSH_NOW);
    await f.t.mutation(hourly, {});
    await f.t.finishInProgressScheduledFunctions();
    vi.runOnlyPendingTimers();
    await f.t.finishInProgressScheduledFunctions();
    expect(await f.sends()).toEqual([expect.objectContaining({ title: "To-dos: 1 withdrawal request, 2 signups to review", url: "/inbox" })]);
  });
});

describe("Mentor meeting digest (M4/M5)", () => {
  const HOUR = 3_600_000;
  /** Mentors: creator (Build), build, elec (Electrical), quiet (Build, "Meetings and events" turned off), invited (Build, already invited). Build and creator have a device. */
  async function mentors(f: Awaited<ReturnType<typeof fixture>>) {
    return await f.t.run(async ctx => {
      const mentor = async (key: string, subteams: string[]) => {
        const authUserId = await ctx.db.insert("users", { email: `${key}@example.invalid` });
        const id = await ctx.db.insert("appUsers", { authUserId, email: `${key}@example.invalid`, name: key, role: "mentor", active: true, travelLead: false, financialEdit: false, subteams });
        return { id, authUserId };
      };
      const m = { creator: await mentor("creator", ["Build"]), build: await mentor("build", ["Build"]), elec: await mentor("elec", ["Electrical"]), quiet: await mentor("quiet", ["Build"]), invited: await mentor("invited", ["Build"]) };
      await ctx.db.insert("notificationPreferences", { userId: m.quiet.id, disabledCategories: ["mentorEvents"], updatedAt: 0 });
      for (const who of [m.build, m.creator]) await ctx.db.insert("pushSubscriptions", { userId: who.id, endpoint: `https://fcm.googleapis.com/fcm/send/${who.id}`, p256dh: "key", auth: "auth", deviceLabel: "Phone", createdAt: 0 });
      return m;
    });
  }
  const meeting = (f: Awaited<ReturnType<typeof fixture>>, createdBy: Id<"appUsers">, extra: Partial<Doc<"events">> = {}) => f.t.run(async ctx => {
    const eventId = await ctx.db.insert("events", {
      seasonId: (await ctx.db.query("seasons").first())!._id, name: "Build Night", type: "Team", startsAt: FLUSH_NOW + 2 * 86_400_000, endsAt: FLUSH_NOW + 2 * 86_400_000 + HOUR, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false,
      feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, audienceKind: "everyone", mandatory: false, createdBy, ...extra,
    });
    return eventId;
  });
  const flushAt5 = async (f: Awaited<ReturnType<typeof fixture>>) => {
    vi.setSystemTime(FLUSH_NOW);
    await f.t.mutation(flush, {});
    await f.t.finishInProgressScheduledFunctions();
  };

  it("M4: a new event is queued once for Mentors who can sign up (not for specific-students meetings), never the creator or invited Mentors, and pushed only in the 5 PM summary", async () => {
    const f = await fixture();
    const m = await mentors(f);
    vi.setSystemTime(FLUSH_NOW - 7 * HOUR); // Wed 10 AM Chicago: quiet hours; the digest still holds every push
    const everyone = await meeting(f, m.creator.id);
    const buildOnly = await meeting(f, m.creator.id, { name: "Build subteam", audienceKind: "subteams", audienceSubteams: ["Build"] });
    const elecOnly = await meeting(f, m.creator.id, { name: "Electrical subteam", audienceKind: "subteams", audienceSubteams: ["Electrical"] });
    const skipped = [await meeting(f, m.creator.id, { name: "Canceled", cancelled: true }), await meeting(f, m.creator.id, { name: "Over", startsAt: FLUSH_NOW - 9 * HOUR, endsAt: FLUSH_NOW - 8 * HOUR })];
    // Mentors get "New meeting" notices only for whole-team or their-subteam meetings; specific-students ones are not queued (owner decision, Nov 9 2026).
    const students = await meeting(f, m.creator.id, { name: "Students", audienceKind: "students" });
    const competition = await meeting(f, f.ids.coach, { name: "Competition", type: "Competition", audienceKind: undefined, mandatory: undefined });
    await f.t.run(ctx => ctx.db.insert("eventMentorInvites", { eventId: everyone, mentorUserId: m.invited.id, source: "individual", status: "invited", invitedBy: m.creator.id, createdAt: 0 }));
    for (const eventId of [everyone, everyone, buildOnly, elecOnly, ...skipped, students, competition]) await f.t.run(ctx => queueMentorMeetingOpenDigest(ctx, { eventId }));
    const titles = async (userId: Id<"appUsers">) => (await f.inbox(userId)).map(row => [row.title, row.category, row.pushStatus]);
    const row = (title: string, status = "digest") => [title, "mentorEvents", status];
    expect(await titles(m.build.id)).toEqual([row("New meeting: Build Night"), row("New meeting: Build subteam"), row("New event: Competition")]);
    expect(await titles(m.elec.id)).toEqual([row("New meeting: Build Night"), row("New meeting: Electrical subteam"), row("New event: Competition")]);
    expect(await titles(m.quiet.id)).toEqual([row("New meeting: Build Night", "skipped"), row("New meeting: Build subteam", "skipped"), row("New event: Competition", "skipped")]);
    // Already invited to Build Night, so not that one.
    expect(await titles(m.invited.id)).toEqual([row("New meeting: Build subteam"), row("New event: Competition")]);
    // The creator hears only about what someone else created.
    expect(await titles(m.creator.id)).toEqual([row("New event: Competition")]);
    for (const userId of [f.ids.coach, f.ids.parent, f.ids.studentUser]) expect(await f.inbox(userId)).toEqual([]);
    expect(await f.sends()).toEqual([]);
    await flushAt5(f);
    expect(await f.sends()).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Meetings: 3 new events you can join", url: "/inbox" }),
      expect.objectContaining({ title: "Meetings: 1 new event you can join", url: `/events/${competition}` }),
    ]));
    expect(await f.sends()).toHaveLength(2);
  });

  it("M5: sign-ups, drop-outs and pending approvals on a Mentor's meeting reach only that creator, never for their own action or a Coach's meeting", async () => {
    const f = await fixture();
    const m = await mentors(f);
    const mine = await meeting(f, m.creator.id);
    const quietOwn = await meeting(f, m.quiet.id, { name: "Quiet meeting" });
    const coachOwn = await meeting(f, f.ids.coach, { name: "Coach meeting" });
    const cancelled = await meeting(f, m.creator.id, { name: "Canceled", cancelled: true });
    const asBuild = f.t.withIdentity({ subject: `${m.build.authUserId}|session` });
    const asCreator = f.t.withIdentity({ subject: `${m.creator.authUserId}|session` });
    await asBuild.run(ctx => queueMentorMeetingActivityDigest(ctx, { eventId: mine, activity: "mentorJoined" }));
    await f.t.run(ctx => queueMentorMeetingActivityDigest(ctx, { eventId: mine, activity: "studentJoined" }));
    await f.t.run(ctx => queueMentorMeetingActivityDigest(ctx, { eventId: mine, activity: "signupPending" }));
    await asCreator.run(ctx => queueMentorMeetingActivityDigest(ctx, { eventId: mine, activity: "mentorLeft" }));
    for (const eventId of [quietOwn, coachOwn, cancelled]) await asBuild.run(ctx => queueMentorMeetingActivityDigest(ctx, { eventId, activity: "mentorJoined" }));
    const rows = await f.inbox(m.creator.id);
    expect(rows.map(row => [row.title, row.body])).toEqual([
      ["Mentor signed up: Build Night", "A Mentor signed up for your meeting on Fri, Jan 16. Open the meeting for details."],
      ["Student signed up: Build Night", "A student signed up for your meeting on Fri, Jan 16. Open the meeting for details."],
      ["Signup to approve: Build Night", "A student signup for your meeting on Fri, Jan 16 is waiting for approval. Open the meeting to review it."],
    ]);
    expect(rows.every(row => row.category === "mentorEvents" && row.pushStatus === "digest" && row.url === `/events/${mine}`)).toBe(true);
    expect((await f.inbox(m.quiet.id)).map(row => row.pushStatus)).toEqual(["skipped"]);
    for (const userId of [m.build.id, m.elec.id, f.ids.coach, f.ids.parent, f.ids.studentUser]) expect(await f.inbox(userId)).toEqual([]);
    await flushAt5(f);
    expect(await f.sends()).toEqual([expect.objectContaining({ title: "Meetings: 1 Mentor signed up, 1 student signed up, 1 signup request to approve", url: `/events/${mine}` })]);
  });
});
