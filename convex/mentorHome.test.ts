/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

/** Synthetic data only. Mentor Home: one query with scheduled, pending, sign-up and created meetings. */
const modules = import.meta.glob("./**/*.ts");
const HOUR = 3_600_000, DAY = 24 * HOUR;

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: Doc<"appUsers">["role"], extra: Partial<Doc<"appUsers">> = {}) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead: false, financialEdit: false, active: true, ...extra });
      return { auth, id };
    }
    const coach = await account("mh-coach", "coach");
    const mentor = await account("mh-mentor", "mentor", { subteams: ["Build", "CAD"] });
    const other = await account("mh-other", "mentor", { subteams: ["Electrical"] });
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    return { coach, mentor, other, season };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  const seed = (name: string, days: number, extra: Partial<Doc<"events">> = {}) => t.run(ctx => ctx.db.insert("events", {
    seasonId: ids.season, name, type: "Team", startsAt: Date.now() + days * DAY, endsAt: Date.now() + days * DAY + HOUR, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0,
    signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, audienceKind: "everyone", mandatory: false, ...extra,
  }));
  const invite = (eventId: Id<"events">, mentorUserId: Id<"appUsers">, status: "invited" | "accepted" | "declined", source: "individual" | "subteam" | "self" = "individual") =>
    t.run(ctx => ctx.db.insert("eventMentorInvites", { eventId, mentorUserId, source, status, invitedBy: ids.coach.id, createdAt: 1 }));
  return { t, ids, as, seed, invite };
}

describe("mentorHome", () => {
  it("groups the Mentor's meetings, sorted, and leaves out what isn't theirs", async () => {
    const f = await fixture();
    const later = await f.seed("Accepted later", 5), sooner = await f.seed("Self sooner", 2);
    await f.invite(later, f.ids.mentor.id, "accepted"); await f.invite(sooner, f.ids.mentor.id, "accepted", "self");
    const pending = await f.seed("Invited", 3, { audienceKind: "mentorsOnly", signupMode: "assigned" });
    await f.invite(pending, f.ids.mentor.id, "invited");
    await f.seed("Open to everyone", 4); await f.seed("Build only", 6, { audienceKind: "subteams", audienceSubteams: ["Build"] });
    await f.seed("Electrical only", 4, { audienceKind: "subteams", audienceSubteams: ["Electrical"] });
    await f.seed("Students only", 4, { audienceKind: "students" });
    await f.seed("Canceled open", 4, { cancelled: true });
    await f.seed("Past", -3);
    await f.seed("Competition", 4, { type: "Competition" });
    const mine = await f.seed("My own", 7, { createdBy: f.ids.mentor.id, audienceKind: "students" });
    await f.seed("Other's", 7, { createdBy: f.ids.other.id, audienceKind: "students" });
    const home = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.canCreateMeeting).toBe(true);
    expect(home.subteams).toEqual(["Build", "CAD"]);
    expect(home.scheduled.map(row => row.title)).toEqual(["Self sooner", "Accepted later"]);
    expect(home.scheduled[0]).toMatchObject({ myStatus: "accepted", mySource: "self", canWithdraw: true, canSignUp: false });
    expect(home.pendingInvites.map(row => row.title)).toEqual(["Invited"]);
    // Every event is open except ones for other subteams only (owner decision, Nov 6 2026): specific students, other types
    // and other Mentors' meetings included; "Electrical only", canceled and past events are not.
    // (Same-day seeds can share a start time, so membership is checked without order; the sort is checked above.)
    expect(home.signUpAvailable.map(row => row.title).sort()).toEqual(["Build only", "Competition", "Open to everyone", "Other's", "Students only"]);
    expect(home.signUpAvailable[0]).toMatchObject({ canSignUp: true, myStatus: null });
    expect(home.created.map(row => row.eventId)).toEqual([mine]);
    expect(home.created[0]).toMatchObject({ isCreator: true, canManage: true });
    expect(home.truncated).toBe(false);
  });

  it("includes a repeating series the Mentor created and counts its meetings as theirs", async () => {
    const f = await fixture();
    const seriesId = await f.t.run(ctx => ctx.db.insert("eventSeries", {
      seasonId: f.ids.season, createdBy: f.ids.mentor.id, createdAt: 1, name: "Weekly", status: "active", origin: "created",
      template: { type: "Team", destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, audienceKind: "everyone", mandatory: false },
      localStartTime: "18:00", durationMinutes: 60, weekdays: [2], intervalWeeks: 1, startDate: "2030-01-01", timeZone: "America/Chicago", templateRevision: 1,
    }));
    await f.seed("Occurrence", 3, { seriesId, seriesOccurrenceKey: "2030-01-01" });
    const home = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.createdSeries).toEqual([expect.objectContaining({ seriesId, name: "Weekly", status: "active" })]);
    expect(home.created.map(row => row.title)).toEqual(["Occurrence"]);
    expect(home.created[0].seriesId).toBe(seriesId);
    expect((await f.as(f.ids.other).query(api.mentorHome.mentorHome, { asOf: Date.now() })).created).toEqual([]);
  });

  it("shows a declined invitation again as a sign-up option when it is open to the Mentor", async () => {
    const f = await fixture();
    const eventId = await f.seed("Open", 2);
    await f.invite(eventId, f.ids.mentor.id, "declined");
    const home = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.signUpAvailable.map(row => row.eventId)).toEqual([eventId]);
    expect(home.scheduled).toEqual([]);
  });
});

describe("mentorHome bounded reads", () => {
  const filler = (f: Awaited<ReturnType<typeof fixture>>, count: number, extra: Partial<Doc<"events">>, offset = 0) => f.t.run(async ctx => {
    for (let i = 0; i < count; i++) await ctx.db.insert("events", {
      seasonId: f.ids.season, name: `Row ${i}`, type: "Team", startsAt: Date.now() + HOUR + offset + i * 1000, endsAt: Date.now() + 2 * HOUR + offset + i * 1000, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0,
      signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, mandatory: false, ...extra,
    });
  });

  it("finds the Mentor's own meetings and meetings to join behind hundreds of earlier events", async () => {
    const f = await fixture();
    // Hundreds of earlier events this Mentor can't join (another subteam's only).
    await filler(f, 320, { audienceKind: "subteams", audienceSubteams: ["Electrical"], createdBy: f.ids.other.id });
    const accepted = await f.seed("Accepted far", 60), created = await f.seed("Created far", 61, { createdBy: f.ids.mentor.id, audienceKind: "students" }), joinable = await f.seed("Joinable far", 62);
    await f.invite(accepted, f.ids.mentor.id, "accepted");
    const home = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.scheduled.map(row => row.eventId)).toEqual([accepted]);
    expect(home.created.map(row => row.eventId)).toEqual([created]);
    expect(home.signUpAvailable.map(row => row.eventId)).toEqual([joinable]);
  });

  it("returns up to 100 joinable and created meetings for the full Your schedule lists", async () => {
    const f = await fixture();
    await filler(f, 110, { audienceKind: "everyone" }, DAY);
    await filler(f, 110, { audienceKind: "students", createdBy: f.ids.mentor.id }, DAY);
    const home = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.signUpAvailable).toHaveLength(100);
    expect(home.created).toHaveLength(100);
    expect(home.truncated).toBe(true);
  });

  it("keeps a long event that starts first even when 100 shorter events end before it", async () => {
    const f = await fixture();
    const long = await f.seed("Long, starts first", 0, { startsAt: Date.now() + HOUR / 2, endsAt: Date.now() + 10 * DAY });
    await filler(f, 100, { audienceKind: "everyone" });
    const home = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.signUpAvailable).toHaveLength(100);
    expect(home.signUpAvailable[0].eventId).toBe(long);
    expect(home.truncated).toBe(true);
  });
});

describe("mentorHome review fixes (round 4)", () => {
  const template = { type: "Team" as const, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open" as const, allowWithdrawal: true, permissionRequired: false, firstRequired: false, audienceKind: "everyone" as const, mandatory: false };

  it("lists the creator of an event that isn't (or is no longer) a Mentor meeting as able to sign up, like anyone else", async () => {
    const f = await fixture();
    // A Coach made the Mentor's meeting Outreach; a Travel Lead created an overnight travel Competition. Neither is a Mentor
    // meeting, so their creator isn't counted as going and joins through the normal sign-up.
    const outreach = await f.seed("Now Outreach", 2, { createdBy: f.ids.mentor.id, isOutreach: true });
    const trip = await f.seed("Overnight regional", 3, { type: "Competition", travel: "Charter Bus", overnight: true, createdBy: f.ids.mentor.id });
    const home = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.signUpAvailable.map(row => row.eventId)).toEqual([outreach, trip]);
    expect(home.created.map(row => row.eventId)).toEqual([]);
    // Their own Mentor meeting stays out of sign-up (they're already on it).
    const own = await f.seed("Own meeting", 4, { createdBy: f.ids.mentor.id });
    const again = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(again.signUpAvailable.map(row => row.eventId)).not.toContain(own);
    expect(again.created.map(row => row.eventId)).toEqual([own]);
  });

  it("an old asOf (even 0) doesn't bring back past events the server has archived", async () => {
    const f = await fixture();
    const past = await f.seed("Ended", -2, { archived: true });
    const endedJustNow = await f.seed("Ended before the sweep", -1); // created after it ended, not archived yet
    const upcoming = await f.seed("Upcoming", 2);
    const home = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: 0 });
    expect(home.signUpAvailable.map(row => row.eventId)).toEqual([upcoming]);
    expect(home.signUpAvailable.map(row => row.eventId)).not.toContain(past);
    expect(home.signUpAvailable.map(row => row.eventId)).not.toContain(endedJustNow);
    await expect(f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Number.NaN })).rejects.toThrow("could not load");
  });

  it.each([
    ["a fee", { template: { ...template, feeCents: 1000 } }],
    ["Outreach", { template: { ...template, isOutreach: true } }],
    ["automatic assignment", { template: { ...template, assignmentScope: "wholeTeam" as const } }],
    ["Team Calendar", { template, calendarMasterId: "synthetic-master" }],
  ])("doesn't list a series the Mentor can no longer manage (%s)", async (_label, change) => {
    const f = await fixture();
    const series = (extra: Partial<Doc<"eventSeries">>) => f.t.run(ctx => ctx.db.insert("eventSeries", {
      seasonId: f.ids.season, createdBy: f.ids.mentor.id, createdAt: 1, name: "Weekly", status: "active", origin: "created", template,
      localStartTime: "18:00", durationMinutes: 60, weekdays: [2], intervalWeeks: 1, startDate: "2030-01-01", timeZone: "America/Chicago", templateRevision: 1, ...extra,
    }));
    const kept = await series({}), changed = await series(change);
    const home = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.createdSeries.map(row => row.seriesId)).toEqual([kept]);
    expect(home.createdSeries.map(row => row.seriesId)).not.toContain(changed);
  });

  it("finds an upcoming invitation behind 250 newer invitations for past events", async () => {
    const f = await fixture();
    const upcoming = await f.seed("Upcoming", 5, { audienceKind: "mentorsOnly", signupMode: "assigned" });
    await f.invite(upcoming, f.ids.mentor.id, "invited");
    await f.t.run(async ctx => {
      for (let i = 0; i < 250; i++) {
        const eventId = await ctx.db.insert("events", {
          seasonId: f.ids.season, name: `Past ${i}`, type: "Team", startsAt: Date.now() - 30 * DAY + i * HOUR, endsAt: Date.now() - 30 * DAY + i * HOUR + HOUR / 2, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0,
          signupMode: "assigned", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, audienceKind: "mentorsOnly", mandatory: false,
        });
        await ctx.db.insert("eventMentorInvites", { eventId, mentorUserId: f.ids.mentor.id, source: "individual", status: "invited", invitedBy: f.ids.coach.id, createdAt: 2 });
      }
    });
    const home = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.pendingInvites.map(row => row.eventId)).toEqual([upcoming]);
    expect(home.truncated).toBe(false);
  });
});

describe("mentorHome joinable (grouped, owner decision Nov 7 2026)", () => {
  const template = { type: "Team" as const, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open" as const, allowWithdrawal: true, permissionRequired: false, firstRequired: false, audienceKind: "everyone" as const, mandatory: false };

  it("shows one entry per repeating series, with its schedule, counts and the next meeting to sign up for", async () => {
    const f = await fixture();
    const seriesId = await f.t.run(ctx => ctx.db.insert("eventSeries", {
      seasonId: f.ids.season, createdBy: f.ids.coach.id, createdAt: 1, name: "Build nights", status: "active", origin: "created", template,
      localStartTime: "18:00", durationMinutes: 120, weekdays: [4, 2], intervalWeeks: 1, startDate: "2030-01-01", timeZone: "America/Chicago", templateRevision: 1,
    }));
    const week = (days: number, key: string) => f.seed("Build night", days, { seriesId, seriesOccurrenceKey: key });
    const first = await week(1, "2030-01-01"), second = await week(8, "2030-01-08");
    await week(15, "2030-01-15");
    const oneTime = await f.seed("Open house", 3);
    const home = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.signUpAvailable).toHaveLength(4); // the per-meeting list is unchanged
    expect(home.joinable).toEqual([
      expect.objectContaining({
        kind: "series", seriesId, title: "Build nights", repeatLabel: "Repeats weekly", scheduleLabel: "Tuesdays and Thursdays at 6:00 PM",
        nextEventId: first, upcomingCount: 3, joinableCount: 3, hasSeriesSignup: false, category: "meetings", forYourSubteam: false,
        next: expect.objectContaining({ eventId: first, canSignUp: true }),
      }),
      expect.objectContaining({ kind: "event", seriesId: null, title: "Open house", repeatLabel: null, scheduleLabel: null, nextEventId: oneTime, upcomingCount: 1, joinableCount: 1, hasSeriesSignup: false }),
    ]);

    // "Just this one" on the first meeting: the series entry moves to the next meeting and says the Mentor has a sign-up.
    await f.t.run(async ctx => {
      const signupId = await ctx.db.insert("mentorSeriesSignups", { seriesId, mentorUserId: f.ids.mentor.id, status: "active", scope: "one", coveredKeys: ["2030-01-01"], skippedKeys: [], createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("eventMentorInvites", { eventId: first, mentorUserId: f.ids.mentor.id, source: "self", status: "accepted", invitedBy: f.ids.mentor.id, createdAt: 1, seriesSignupId: signupId });
    });
    const after = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(after.joinable.find(entry => entry.seriesId === seriesId)).toMatchObject({ nextEventId: second, upcomingCount: 3, joinableCount: 2, hasSeriesSignup: true });
  });

  it("counts only meetings this Mentor may join: not ones a Coach restricted to other subteams, nor ones they can't sign up for", async () => {
    const f = await fixture();
    const seriesId = await f.t.run(ctx => ctx.db.insert("eventSeries", {
      seasonId: f.ids.season, createdBy: f.ids.coach.id, createdAt: 1, name: "Mixed nights", status: "active", origin: "created", template,
      localStartTime: "18:00", durationMinutes: 60, weekdays: [2], intervalWeeks: 1, startDate: "2030-01-01", timeZone: "America/Chicago", templateRevision: 1,
    }));
    const week = (days: number, key: string, extra: Partial<Doc<"events">> = {}) => f.seed("Mixed night", days, { seriesId, seriesOccurrenceKey: key, ...extra });
    const first = await week(1, "2030-01-01");
    await week(8, "2030-01-08", { audienceKind: "subteams", audienceSubteams: ["Electrical"] }); // the Mentor is Build and CAD
    await week(15, "2030-01-15", { audienceKind: "subteams", audienceSubteams: ["Build"] });
    await week(22, "2030-01-22", { cancelled: true });
    const home = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.joinable).toEqual([expect.objectContaining({ seriesId, nextEventId: first, upcomingCount: 2, joinableCount: 2 })]);
    // The other Mentor (Electrical) sees the other restricted meeting instead.
    const other = await f.as(f.ids.other).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(other.joinable).toEqual([expect.objectContaining({ seriesId, upcomingCount: 2, joinableCount: 2 })]);
  });

  it("joinableCount leaves out meetings the Mentor is already on", async () => {
    const f = await fixture();
    const seriesId = await f.t.run(ctx => ctx.db.insert("eventSeries", {
      seasonId: f.ids.season, createdBy: f.ids.coach.id, createdAt: 1, name: "Nights", status: "active", origin: "created", template,
      localStartTime: "18:00", durationMinutes: 60, weekdays: [2], intervalWeeks: 1, startDate: "2030-01-01", timeZone: "America/Chicago", templateRevision: 1,
    }));
    const a = await f.seed("Night", 1, { seriesId, seriesOccurrenceKey: "2030-01-01" });
    await f.seed("Night", 8, { seriesId, seriesOccurrenceKey: "2030-01-08" });
    await f.t.run(ctx => ctx.db.insert("eventMentorInvites", { eventId: a, mentorUserId: f.ids.mentor.id, source: "self", status: "accepted", invitedBy: f.ids.mentor.id, createdAt: 1 }));
    const home = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.joinable).toEqual([expect.objectContaining({ seriesId, upcomingCount: 2, joinableCount: 1 })]);
  });

  it.each([
    ["a Team meeting for everyone", {}, "meetings", false],
    ["a Team meeting for the Mentor's subteam", { audienceKind: "subteams", audienceSubteams: ["Mechanical"] }, "meetings", true],
    ["a Competition (even for the Mentor's subteam)", { type: "Competition", audienceKind: "subteams", audienceSubteams: ["Build"] }, "competitionsAndTrips", false],
    ["an Outreach event with travel", { type: "Outreach", travel: "Charter Bus" }, "meetings", false],
    ["a Fundraiser with travel", { type: "Fundraiser", travel: "Charter Bus" }, "meetings", false],
    ["a Team meeting with travel for the Mentor's subteam", { travel: "Charter Bus", audienceKind: "subteams", audienceSubteams: ["Build"] }, "meetings", true],
    ["an overnight trip", { type: "Outreach", travel: "Charter Bus", overnight: true }, "competitionsAndTrips", false],
    ["an on-site event with a travel value", { travel: "Charter Bus", onsite: true }, "meetings", false],
  ] as const)("puts %s in %s (forYourSubteam %s)", async (_label, extra, category, forYourSubteam) => {
    const f = await fixture();
    const eventId = await f.seed("Event", 2, extra as Partial<Doc<"events">>);
    const home = await f.as(f.ids.mentor).query(api.mentorHome.mentorHome, { asOf: Date.now() });
    expect(home.joinable).toEqual([expect.objectContaining({ nextEventId: eventId, category, forYourSubteam })]);
  });
});
