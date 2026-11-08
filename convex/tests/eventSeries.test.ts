/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTest } from "../../testUtils";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { chicagoDate } from "../lib/calendarDates";
import { googleInstanceId } from "../lib/rrule";
import { addDays, occurrencesBetween, weekdayOf } from "../lib/seriesRecurrence";
import { zonedWallTimeToUtc } from "../../shared/chicago-time";

const modules = import.meta.glob("../**/*.ts");
const calendarId = "synthetic-calendar@example.invalid";
const environmentKeys = ["TIMECLOCK_CALENDAR_ID", "TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL", "TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY", "STUDENT_STATUS_CALENDAR_WRITE_ENABLED", "CONVEX_CLOUD_URL"] as const;
const originalEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]])) as Record<(typeof environmentKeys)[number], string | undefined>;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const key of environmentKeys) {
    const original = originalEnvironment[key];
    if (original === undefined) delete process.env[key]; else process.env[key] = original;
  }
});

async function syntheticPrivateKey() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...bytes)).match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
}

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "student" | "parent", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead, financialEdit: false, active: true });
      return { auth, id };
    }
    const coach = await account("es-coach", "coach"), lead = await account("es-lead", "mentor", true), mentor = await account("es-mentor", "mentor");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    const students: Id<"students">[] = [];
    for (const [name, subteam] of [["es-build", "Build"], ["es-elec", "Electrical"], ["es-code", "Programming"]] as const) {
      const user = await account(name, "student");
      students.push(await ctx.db.insert("students", { seasonId: season, userId: user.id, legalName: name, preferredName: name, email: `${name}@example.invalid`, subteam, active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } }));
    }
    return { coach, lead, mentor, season, students };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  const drain = async () => { for (let i = 0; i < 60; i++) { vi.advanceTimersByTime(5_000); await t.finishInProgressScheduledFunctions(); } };
  return { t, ids, coach: as(ids.coach), lead: as(ids.lead), mentor: as(ids.mentor), drain };
}

const today = () => chicagoDate(Date.now());
const template = { type: "Team" as const, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, allowWithdrawal: true, permissionRequired: false, firstRequired: false };
function weeklyFrom(offsetDays: number) {
  const startDate = addDays(today(), offsetDays);
  return { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, localStartTime: "18:00", durationMinutes: 120 };
}
const rows = (t: Awaited<ReturnType<typeof fixture>>["t"], seriesId?: Id<"eventSeries">) => t.run(async ctx => (await ctx.db.query("events").take(500)).filter(row => seriesId === undefined || row.seriesId === seriesId));
const notifications = (t: Awaited<ReturnType<typeof fixture>>["t"]) => t.run(ctx => ctx.db.query("notifications").take(1000));

describe("recurring meeting series", () => {
  it("generates the 8-week window idempotently, enrolls silently and sends one series notice", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId, firstEventId } = await f.coach.mutation(api.eventSeries.create, { name: "Team meeting", ...template, audienceKind: "everyone", mandatory: true, mentorInviteUserIds: [f.ids.mentor.id], rule: weeklyFrom(1) });
    await f.drain();
    const created = await rows(f.t, seriesId);
    expect(created).toHaveLength(8);
    expect(new Set(created.map(row => row.seriesOccurrenceKey)).size).toBe(8);
    expect(created.every(row => row.assignmentScope === "wholeTeam" && row.calendarChoice === undefined)).toBe(true);

    // Running generation and the daily tick again creates nothing new.
    await f.t.mutation(internal.eventSeries.generate, { seriesId, toKey: addDays(today(), 56) });
    await f.t.mutation(internal.eventSeries.tick, { cursor: null });
    await f.drain();
    expect(await rows(f.t, seriesId)).toHaveLength(8);

    // Mandatory meetings enrolled every student through the job, with no per-meeting assignment or invite push.
    const participants = await f.t.run(ctx => ctx.db.query("participants").take(500));
    expect(participants).toHaveLength(8 * f.ids.students.length);
    const invites = await f.t.run(ctx => ctx.db.query("eventMentorInvites").take(100));
    expect(invites).toHaveLength(8);
    const all = await notifications(f.t);
    // M4: one "new meeting" digest item for the series' first meeting, to the uninvited Mentor who can sign up (not the invited one).
    expect(all.filter(row => row.pushStatus === "digest").map(row => [row.userId, row.dedupeKey])).toEqual([[f.ids.lead.id, `${f.ids.lead.id}:m4:${firstEventId}`]]);
    const sent = all.filter(row => row.pushStatus !== "digest");
    expect(sent.every(row => row.dedupeKey?.endsWith(`series:${firstEventId}`))).toBe(true);
    expect(sent.map(row => row.userId).sort()).toEqual([...new Set(sent.map(row => row.userId))].sort());
    expect(sent).toHaveLength(f.ids.students.length + 1);
  });

  it("applies the single-event role rules", async () => {
    const f = await fixture();
    const args = { name: "Meeting", ...template, audienceKind: "everyone" as const, rule: weeklyFrom(2) };
    // A plain Mentor may create an optional Team series; a required one is still refused.
    await expect(f.mentor.mutation(api.eventSeries.create, { ...args, mandatory: true })).rejects.toThrow("Mentors can't create required meetings");
    await expect(f.lead.mutation(api.eventSeries.create, { ...args, mandatory: true })).rejects.toThrow("Only Coaches can make an event mandatory");
    await expect(f.lead.mutation(api.eventSeries.create, { ...args, audienceKind: "subteams", audienceSubteams: ["Build"], mandatory: true })).rejects.toThrow("Only Coaches can make an event mandatory");
    const { seriesId } = await f.lead.mutation(api.eventSeries.create, args);
    expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ name: "Meeting", template: expect.objectContaining({ mandatory: false }) });
    await expect(f.mentor.mutation(api.eventSeries.create, { ...args, name: "Mentor meeting", rule: weeklyFrom(3) })).resolves.toMatchObject({ seriesId: expect.anything() });
    await expect(f.lead.action(api.eventSeries.googleSeriesCandidates, {})).rejects.toThrow("Only a Coach");
    await expect(f.coach.mutation(api.eventSeries.create, { ...args, rule: { ...weeklyFrom(-7) } })).rejects.toThrow("today or later");
  });

  it("generates a plain Mentor's optional series and stops one that is no longer Mentor-safe or whose Mentor left", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const args = { ...template, audienceKind: "everyone" as const, rule: weeklyFrom(1) };
    const { seriesId } = await f.mentor.mutation(api.eventSeries.create, { name: "Mentor build night", ...args });
    await f.drain();
    expect(await rows(f.t, seriesId)).toHaveLength(8);
    expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ status: "active" });

    // A required audience on a Mentor's series (e.g. changed later) is beyond the Mentor limits: generation stops for review.
    const { seriesId: requiredId } = await f.mentor.mutation(api.eventSeries.create, { name: "Mentor required", ...args, rule: { ...weeklyFrom(1), localStartTime: "16:00", durationMinutes: 60 } });
    await f.t.run(async ctx => {
      const series = (await ctx.db.get(requiredId))!;
      await ctx.db.patch(requiredId, { template: { ...series.template, mandatory: true, assignmentScope: "wholeTeam" } });
      for (const row of await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", requiredId)).take(50)) await ctx.db.delete(row._id);
    });
    await f.t.mutation(internal.eventSeries.generate, { seriesId: requiredId, toKey: addDays(today(), 56) });
    expect(await rows(f.t, requiredId)).toHaveLength(0);
    expect(await f.t.run(ctx => ctx.db.get(requiredId))).toMatchObject({ status: "needsReview" });

    // A deactivated Mentor's series goes to review too.
    await f.t.run(async ctx => {
      for (const row of await ctx.db.query("events").withIndex("by_seriesId_and_seriesOccurrenceKey", q => q.eq("seriesId", seriesId)).take(50)) await ctx.db.delete(row._id);
      await ctx.db.patch(f.ids.mentor.id, { active: false });
    });
    await f.t.mutation(internal.eventSeries.generate, { seriesId, toKey: addDays(today(), 56) });
    expect(await rows(f.t, seriesId)).toHaveLength(0);
    expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ status: "needsReview" });
  });

  it("splits 'this and following' only after today and before any attendance, re-pointing the same rows", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Build night", ...template, audienceKind: "students", audienceStudentIds: [f.ids.students[0]], rule: weeklyFrom(1) });
    await f.drain();
    const before = (await rows(f.t, seriesId)).sort((a, b) => a.seriesOccurrenceKey!.localeCompare(b.seriesOccurrenceKey!));
    const firstKey = before[0].seriesOccurrenceKey!, thirdKey = before[2].seriesOccurrenceKey!;
    await expect(f.coach.mutation(api.eventSeries.editFuture, { seriesId, fromKey: today(), localStartTime: "19:00" })).rejects.toThrow("after today");
    await expect(f.coach.mutation(api.eventSeries.editFuture, { seriesId, fromKey: addDays(thirdKey, 1), localStartTime: "19:00" })).rejects.toThrow("isn't a meeting");
    await expect(f.mentor.mutation(api.eventSeries.editFuture, { seriesId, fromKey: thirdKey, localStartTime: "19:00" })).rejects.toThrow("Coach or Travel Lead");

    // Attendance already taken on a later meeting blocks the split.
    await f.t.run(async ctx => {
      await ctx.db.patch(before[4]._id, { calendarEventId: "synthetic-instance-5" });
      const occurrenceId = await ctx.db.insert("timeclockOccurrences", { seasonId: f.ids.season, source: "calendar", sourceKey: "synthetic-instance-5", title: "Build night", allDay: false, scheduledStart: before[4].startsAt, scheduledEnd: before[4].endsAt, cancelled: false, observedAt: 1, revision: 1, needsReview: false });
      await ctx.db.insert("timeclockSessions", { occurrenceId, seasonId: f.ids.season, state: "closed", scheduledStart: before[4].startsAt, scheduledEnd: before[4].endsAt, effectiveEnd: before[4].endsAt, extensionMs: 0, revision: 1, openedAt: 1, openedBy: f.ids.coach.id, needsReview: false });
    });
    await expect(f.coach.mutation(api.eventSeries.editFuture, { seriesId, fromKey: thirdKey, localStartTime: "19:00" })).rejects.toThrow("Attendance has already been taken");
    await f.t.run(async ctx => {
      for (const session of await ctx.db.query("timeclockSessions").take(10)) await ctx.db.delete(session._id);
    });

    // "This meeting only" detaches the 4th meeting; the split keeps its override.
    await f.coach.mutation(api.eventSeries.editOccurrence, { eventId: before[3]._id, name: "Special build night" });
    const sentBefore = (await notifications(f.t)).length;
    const { seriesId: nextId } = await f.coach.mutation(api.eventSeries.editFuture, { seriesId, fromKey: thirdKey, localStartTime: "19:00" });
    await f.drain();
    const old = await f.t.run(ctx => ctx.db.get(seriesId));
    expect(old).toMatchObject({ untilDate: addDays(thirdKey, -1), status: "active" });
    const moved = (await rows(f.t, nextId)).sort((a, b) => a.seriesOccurrenceKey!.localeCompare(b.seriesOccurrenceKey!));
    expect(moved.map(row => row._id).slice(0, 6)).toEqual(before.slice(2).map(row => row._id));
    expect(moved[0].startsAt).toBe(zonedWallTimeToUtc(thirdKey, "19:00"));
    expect(moved[1]).toMatchObject({ name: "Special build night", startsAt: before[3].startsAt, seriesDetached: true });
    expect((await rows(f.t, seriesId)).map(row => row.seriesOccurrenceKey)).toEqual([firstKey, before[1].seriesOccurrenceKey]);
    // One representative notice: at most one per person for the whole operation.
    const added = (await notifications(f.t)).slice(sentBefore);
    expect(new Set(added.map(row => row.userId)).size).toBe(added.length);
    expect(added.length).toBeLessThanOrEqual(1);
  });

  it("cancels following meetings with one notice and ends the series", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Outreach prep", ...template, audienceKind: "students", audienceStudentIds: [f.ids.students[1]], mandatory: true, rule: weeklyFrom(1) });
    await f.drain();
    const list = (await rows(f.t, seriesId)).sort((a, b) => a.seriesOccurrenceKey!.localeCompare(b.seriesOccurrenceKey!));
    const sentBefore = (await notifications(f.t)).length;
    await f.coach.mutation(api.eventSeries.cancelFuture, { seriesId, fromKey: list[5].seriesOccurrenceKey! });
    await f.drain();
    const after = (await rows(f.t, seriesId)).sort((a, b) => a.seriesOccurrenceKey!.localeCompare(b.seriesOccurrenceKey!));
    expect(after.map(row => row.cancelled ?? false)).toEqual([false, false, false, false, false, true, true, true]);
    const added = (await notifications(f.t)).slice(sentBefore);
    expect(added.map(row => row.dedupeKey)).toEqual(added.map(() => expect.stringContaining(`cancelled:${list[5]._id}`)));
    expect(new Set(added.map(row => row.userId)).size).toBe(added.length);
  });
});

describe("recurring series on Team Calendar", () => {
  async function calendarFixture(write: boolean) {
    process.env.TIMECLOCK_CALENDAR_ID = calendarId;
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL = "service@example.invalid";
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY = await syntheticPrivateKey();
    process.env.STUDENT_STATUS_CALENDAR_WRITE_ENABLED = write ? "true" : "false";
    process.env.CONVEX_CLOUD_URL = "https://amicable-eel-413.convex.cloud";
    const f = await fixture();
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(calendarId));
    const calendarIdHash = Array.from(new Uint8Array(bytes)).map(value => value.toString(16).padStart(2, "0")).join("");
    await f.t.run(ctx => ctx.db.insert("timeclockCalendarSync", { key: "team", calendarIdHash, timezone: "America/Chicago", generation: 1 }));
    return f;
  }

  /** A fake Google Calendar holding recurring masters; instances are listed from the rule, never synthesized by the app. */
  function fakeGoogle(masters: Map<string, Record<string, unknown>>, calls: { method: string; path: string; body?: unknown; ifMatch?: string | null }[]) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.origin === "https://oauth2.googleapis.com") return new Response(JSON.stringify({ access_token: "synthetic-token" }), { status: 200 });
      if (url.origin !== "https://www.googleapis.com") throw new Error(`Unexpected URL ${url.origin}`);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path: url.pathname, body, ifMatch: new Headers(init?.headers).get("if-match") });
      const parts = decodeURIComponent(url.pathname).split("/events")[1]?.split("/").filter(Boolean) ?? [];
      if (method === "POST" && parts.length === 0) {
        if (masters.has(body.id)) return new Response("{}", { status: 409 });
        masters.set(body.id, { ...body, etag: '"m1"', updated: "2026-11-01T12:00:00Z" });
        return new Response(JSON.stringify(masters.get(body.id)), { status: 200 });
      }
      const master = masters.get(parts[0]);
      if (!master) return new Response("{}", { status: 404 });
      if (parts[1] === "instances") {
        const start = master.start as { dateTime: string };
        const localDate = start.dateTime.slice(0, 10), localTime = start.dateTime.slice(11, 16);
        const rrule = (master.recurrence as string[])[0];
        const byday = /BYDAY=([A-Z,]+)/.exec(rrule)![1].split(",").map(code => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"].indexOf(code));
        const timeMin = Date.parse(url.searchParams.get("timeMin")!), timeMax = Date.parse(url.searchParams.get("timeMax")!);
        const items = occurrencesBetween({ anchorDate: localDate, weekdays: byday, intervalWeeks: 1, startLocalTime: localTime, durationMinutes: 120 }, chicagoDate(timeMin), chicagoDate(timeMax), 200)
          .filter(occurrence => occurrence.startsAt >= timeMin && occurrence.startsAt < timeMax)
          .map(occurrence => ({ id: googleInstanceId(parts[0], occurrence.startsAt), etag: `"i-${occurrence.occurrenceKey}"`, status: "confirmed", summary: master.summary, location: master.location, recurringEventId: parts[0], start: { dateTime: new Date(occurrence.startsAt).toISOString() }, end: { dateTime: new Date(occurrence.endsAt).toISOString() }, originalStartTime: { dateTime: new Date(occurrence.startsAt).toISOString() }, updated: "2026-11-01T12:00:00Z" }));
        return new Response(JSON.stringify({ items }), { status: 200 });
      }
      if (method === "PATCH") {
        Object.assign(master, body, { etag: '"m2"' });
        return new Response(JSON.stringify(master), { status: 200 });
      }
      return new Response(JSON.stringify(master), { status: 200 });
    });
  }

  it("creates one master with the RRULE and links every window row to a listed instance", async () => {
    vi.useFakeTimers();
    const f = await calendarFixture(true);
    const masters = new Map<string, Record<string, unknown>>();
    const calls: { method: string; path: string; body?: unknown; ifMatch?: string | null }[] = [];
    fakeGoogle(masters, calls);
    const rule = weeklyFrom(1);
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Team meeting", ...template, audienceKind: "everyone", rule, addToCalendar: true });
    await f.drain();
    const series = await f.t.run(ctx => ctx.db.get(seriesId));
    expect(series).toMatchObject({ calendarSyncState: "synced", calendarMasterId: expect.stringMatching(/^sr[0-9a-f]{40}$/) });
    const post = calls.filter(call => call.method === "POST");
    expect(post).toHaveLength(1);
    expect(post[0].body).toMatchObject({ start: { dateTime: `${rule.startDate}T18:00:00`, timeZone: "America/Chicago" }, recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${["SU", "MO", "TU", "WE", "TH", "FR", "SA"][rule.weekdays[0]]}`], extendedProperties: { private: { studentStatusSeriesId: seriesId } } });
    const linked = await rows(f.t, seriesId);
    expect(linked).toHaveLength(8);
    expect(linked.every(row => row.calendarChoice === "link" && row.calendarSyncState === "synced" && row.calendarEventId === googleInstanceId(series!.calendarMasterId!, row.startsAt))).toBe(true);
    const claims = await f.t.run(ctx => ctx.db.query("eventCalendarClaims").take(100));
    expect(claims).toHaveLength(8);
    expect(calls.some(call => call.method === "PATCH")).toBe(false);

    // A Google-observed change to one instance marks only that row detached.
    const one = linked[2];
    await f.t.mutation(internal.eventCalendar.applyObserved, { eventId: one.calendarEventId!, title: one.name, location: "Gym", start: one.startsAt, end: one.endsAt, allDay: false, recurring: true, cancelled: false, etag: '"changed"', providerUpdatedAt: Date.parse("2026-11-01T12:00:01Z"), description: "" });
    expect(await f.t.run(ctx => ctx.db.get(one._id))).toMatchObject({ destination: "Gym", seriesDetached: true });

    // A duplicate app-owned series of a Calendar-managed one is refused.
    await expect(f.coach.mutation(api.eventSeries.create, { name: "Copy", ...template, audienceKind: "everyone", rule: weeklyFrom(8) })).rejects.toThrow("already on Team Calendar");
  });

  it("adopts an existing Tuesday master without writes, converting an already linked one-off instead of duplicating it", async () => {
    vi.useFakeTimers();
    const f = await calendarFixture(false);
    const masters = new Map<string, Record<string, unknown>>();
    const calls: { method: string; path: string; body?: unknown; ifMatch?: string | null }[] = [];
    const masterId = "tuesdaymaster01";
    masters.set(masterId, { id: masterId, etag: '"t1"', status: "confirmed", summary: "Tuesday meeting", location: "STEM Center", start: { dateTime: "2026-09-01T18:00:00-05:00", timeZone: "America/Chicago" }, end: { dateTime: "2026-09-01T20:00:00-05:00", timeZone: "America/Chicago" }, recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TU"] });
    masters.set("monthly01", { id: "monthly01", etag: '"x"', status: "confirmed", summary: "Board", location: "", start: { dateTime: "2026-09-01T18:00:00-05:00", timeZone: "America/Chicago" }, end: { dateTime: "2026-09-01T19:00:00-05:00", timeZone: "America/Chicago" }, recurrence: ["RRULE:FREQ=MONTHLY;BYDAY=1TU"] });
    fakeGoogle(masters, calls);
    const adoptArgs = { ...template, audienceKind: "everyone" as const };
    await expect(f.coach.action(api.eventSeries.adoptGoogleSeries, { calendarMasterId: "monthly01", ...adoptArgs })).rejects.toThrow("repeats monthly");
    await expect(f.lead.action(api.eventSeries.adoptGoogleSeries, { calendarMasterId: masterId, ...adoptArgs })).rejects.toThrow("Only a Coach");

    // The next Tuesday is already connected as a one-off event (linked through candidates/connect).
    const nextTuesday = occurrencesBetween({ anchorDate: "2026-09-01", weekdays: [2], intervalWeeks: 1, startLocalTime: "18:00", durationMinutes: 120 }, today(), addDays(today(), 8), 1)[0];
    const instanceId = googleInstanceId(masterId, nextTuesday.startsAt);
    const oneOff = await f.t.run(async ctx => {
      const id = await ctx.db.insert("events", { seasonId: f.ids.season, name: "Tuesday meeting", type: "Team", startsAt: nextTuesday.startsAt, endsAt: nextTuesday.endsAt, destination: "STEM Center", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, calendarChoice: "link", calendarEventId: instanceId, calendarEtag: '"old"', calendarSyncState: "synced", calendarRevision: 1 });
      await ctx.db.insert("eventCalendarClaims", { calendarEventId: instanceId, eventId: id });
      return id;
    });
    const seriesId = await f.coach.action(api.eventSeries.adoptGoogleSeries, { calendarMasterId: masterId, ...adoptArgs });
    await f.drain();
    const adopted = await rows(f.t, seriesId);
    const keys = adopted.map(row => row.seriesOccurrenceKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(adopted.length).toBeGreaterThanOrEqual(8);
    expect(adopted.find(row => row.seriesOccurrenceKey === nextTuesday.occurrenceKey)?._id).toBe(oneOff);
    expect(adopted.every(row => row.calendarEventId?.startsWith(`${masterId}_`))).toBe(true);
    expect(calls.every(call => call.method === "GET")).toBe(true);
    expect(await notifications(f.t)).toHaveLength(0);
    expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ origin: "adopted", calendarMasterId: masterId, startDate: "2026-09-01", weekdays: [2], localStartTime: "18:00", durationMinutes: 120 });
    // Adopting the same master again is refused.
    await expect(f.coach.action(api.eventSeries.adoptGoogleSeries, { calendarMasterId: masterId, ...adoptArgs })).rejects.toThrow("already managed");
    expect(await f.t.run(ctx => ctx.db.query("attendanceMeetings").take(1))).toHaveLength(0);
  });
});
