/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTest } from "../../testUtils";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { chicagoDate } from "../lib/calendarDates";
import { formatUtcBasic, googleInstanceId } from "../lib/rrule";
import { addDays, occurrencesBetween, weekdayOf, zonedWallTimeToUtc } from "../lib/seriesRecurrence";

// "Change end date" on a repeating series (eventSeries.setEndDate): no split, one notice at most, silent extension.

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

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "student", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead, financialEdit: false, active: true });
      return { auth, id };
    }
    const coach = await account("se-coach", "coach"), lead = await account("se-lead", "mentor", true), mentor = await account("se-mentor", "mentor");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    const students: Id<"students">[] = [];
    let flaggedStudent: { auth: Id<"users">; id: Id<"appUsers"> } | null = null;
    for (const [name, subteam] of [["se-build", "Build"], ["se-elec", "Electrical"], ["se-code", "Programming"]] as const) {
      // A stored travelLead flag on a Student grants nothing.
      const user = await account(name, "student", name === "se-code");
      if (name === "se-code") flaggedStudent = user;
      students.push(await ctx.db.insert("students", { seasonId: season, userId: user.id, legalName: name, preferredName: name, email: `${name}@example.invalid`, subteam, active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } }));
    }
    return { coach, lead, mentor, season, students, flaggedStudent: flaggedStudent! };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  const drain = async () => { for (let i = 0; i < 60; i++) { vi.advanceTimersByTime(5_000); await t.finishInProgressScheduledFunctions(); } };
  return { t, ids, coach: as(ids.coach), lead: as(ids.lead), mentor: as(ids.mentor), student: as(ids.flaggedStudent), drain };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
const today = () => chicagoDate(Date.now());
const template = { type: "Team" as const, destination: "Lab", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, allowWithdrawal: true, permissionRequired: false, firstRequired: false };
function weeklyFrom(offsetDays: number, untilOffset?: number) {
  const startDate = addDays(today(), offsetDays);
  return { startDate, weekdays: [weekdayOf(startDate)], intervalWeeks: 1, localStartTime: "18:00", durationMinutes: 120, ...(untilOffset !== undefined ? { untilDate: addDays(today(), untilOffset) } : {}) };
}
const sortedRows = async (f: Fixture, seriesId: Id<"eventSeries">) => (await f.t.run(ctx => ctx.db.query("events").take(500))).filter(row => row.seriesId === seriesId).sort((a, b) => a.seriesOccurrenceKey!.localeCompare(b.seriesOccurrenceKey!));
const notifications = (f: Fixture) => f.t.run(ctx => ctx.db.query("notifications").take(1000));

describe("change a series' end date", () => {
  it("shortening cancels only later meetings with at most one notice per person, and keeps the series", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Tuesday meeting", ...template, audienceKind: "everyone", mandatory: true, rule: weeklyFrom(1) });
    await f.drain();
    const before = await sortedRows(f, seriesId);
    expect(before).toHaveLength(8);
    const endDate = addDays(before[2].seriesOccurrenceKey!, 1);
    const preview = await f.coach.query(api.eventSeries.endDateDetails, { seriesId, endDate });
    expect(preview?.preview).toEqual({ endDate, problem: null, lastMeetingDate: before[2].seriesOccurrenceKey, cancelCount: 5, cancelDates: before.slice(3, 6).map(row => row.seriesOccurrenceKey), addCount: 0, laterAddedAutomatically: false, shortening: true, unchanged: false });
    const sentBefore = (await notifications(f)).length;

    expect(await f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate })).toEqual({ cancelled: 5, lastMeetingDate: before[2].seriesOccurrenceKey });
    await f.drain();
    const after = await sortedRows(f, seriesId);
    expect(after.map(row => row._id)).toEqual(before.map(row => row._id));
    expect(after.map(row => row.cancelled ?? false)).toEqual([false, false, false, true, true, true, true, true]);
    expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ untilDate: endDate, status: "active" });
    expect((await f.t.run(ctx => ctx.db.get(seriesId)))?.count).toBeUndefined();
    // No split: no second series was created.
    expect(await f.t.run(ctx => ctx.db.query("eventSeries").take(10))).toHaveLength(1);
    const added = (await notifications(f)).slice(sentBefore);
    expect(added).toHaveLength(f.ids.students.length);
    expect(new Set(added.map(row => row.userId)).size).toBe(added.length);
    expect(added.every(row => row.dedupeKey?.includes(`cancelled:${before[3]._id}`))).toBe(true);

    // The daily job doesn't bring the canceled meetings back.
    await f.t.mutation(internal.eventSeries.tick, { cursor: null });
    await f.drain();
    expect((await sortedRows(f, seriesId)).filter(row => !row.cancelled)).toHaveLength(3);
  });

  it("extending adds the new meetings silently, now and without notices", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId } = await f.lead.mutation(api.eventSeries.create, { name: "Build night", ...template, audienceKind: "students", audienceStudentIds: [f.ids.students[0]], rule: weeklyFrom(1, 15) });
    await f.drain();
    expect(await sortedRows(f, seriesId)).toHaveLength(3);
    expect((await f.lead.query(api.eventSeries.endDateDetails, { seriesId }))?.endDate).toBe(addDays(today(), 15));
    const sentBefore = (await notifications(f)).length;
    // The dialog preview: the current end is "no change"; a later end counts every new meeting up to it (weekly from day 22
    // through day 120), and that some come after the 8-week window.
    expect((await f.lead.query(api.eventSeries.endDateDetails, { seriesId, endDate: addDays(today(), 15) }))?.preview).toMatchObject({ unchanged: true, shortening: false, addCount: 0, cancelCount: 0 });
    const endDate = addDays(today(), 120);
    expect((await f.lead.query(api.eventSeries.endDateDetails, { seriesId, endDate }))?.preview).toMatchObject({ unchanged: false, shortening: false, addCount: 15, laterAddedAutomatically: true });
    const result = await f.lead.mutation(api.eventSeries.setEndDate, { seriesId, endDate });
    expect(result.cancelled).toBe(0);
    // A first batch is generated in the same mutation; the rest of the 8-week window follows right away (scheduled).
    expect((await sortedRows(f, seriesId)).length).toBeGreaterThan(3);
    await f.drain();
    const rows = await sortedRows(f, seriesId);
    expect(rows).toHaveLength(8);
    expect(rows.every(row => !row.cancelled)).toBe(true);
    expect(await notifications(f)).toHaveLength(sentBefore);
    expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ untilDate: endDate, status: "active" });
  });

  it("counts meetings past the 8-week window when shortening or canceling a series that has an end", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    // Weekly from day 1 through day 120: rows exist through the 8-week window (days 1–50); days 57–120 aren't generated yet.
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Thursday build", ...template, audienceKind: "everyone", rule: weeklyFrom(1, 120) });
    await f.drain();
    const rows = await sortedRows(f, seriesId);
    expect(rows).toHaveLength(8);
    const endDate = addDays(today(), 16);
    expect((await f.coach.query(api.eventSeries.endDateDetails, { seriesId, endDate }))?.preview).toMatchObject({
      shortening: true, cancelCount: 5 + 10, cancelDates: [addDays(today(), 22), addDays(today(), 29), addDays(today(), 36)],
    });
    // Short of the window: only what the window adds, with nothing left for later.
    expect((await f.coach.query(api.eventSeries.endDateDetails, { seriesId, endDate: addDays(today(), 121) }))?.preview).toMatchObject({ shortening: false, addCount: 0, laterAddedAutomatically: false });

    const other = await f.coach.mutation(api.eventSeries.create, { name: "Friday build", ...template, audienceKind: "everyone", rule: weeklyFrom(2, 121) });
    await f.drain();
    const otherRows = await sortedRows(f, other.seriesId);
    // Canceling from the sixth meeting (day 37): rows on days 37, 44, 51 and the 10 later meetings of days 58–121.
    expect(await f.coach.mutation(api.eventSeries.cancelFuture, { seriesId: other.seriesId, fromKey: otherRows[5].seriesOccurrenceKey! })).toEqual({ cancelled: 13 });
  });

  it("applies the series editor role rules", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const required = await f.coach.mutation(api.eventSeries.create, { name: "Whole team", ...template, audienceKind: "everyone", mandatory: true, rule: weeklyFrom(1) });
    const endDate = addDays(today(), 30);
    await expect(f.lead.mutation(api.eventSeries.setEndDate, { seriesId: required.seriesId, endDate })).rejects.toThrow("Only a Coach can change a required series");
    expect((await f.lead.query(api.eventSeries.endDateDetails, { seriesId: required.seriesId }))?.blocker).toMatch("Only a Coach");
    await expect(f.student.mutation(api.eventSeries.setEndDate, { seriesId: required.seriesId, endDate })).rejects.toThrow("Only a Coach or Travel Lead");
    await expect(f.mentor.mutation(api.eventSeries.setEndDate, { seriesId: required.seriesId, endDate })).rejects.toThrow("Only a Coach or Travel Lead");
    await expect(f.student.query(api.eventSeries.endDateDetails, { seriesId: required.seriesId })).resolves.toBeNull();
    const open = await f.coach.mutation(api.eventSeries.create, { name: "Open build", ...template, audienceKind: "everyone", rule: weeklyFrom(2) });
    await expect(f.lead.mutation(api.eventSeries.setEndDate, { seriesId: open.seriesId, endDate })).resolves.toMatchObject({ cancelled: expect.any(Number) });
  });

  it("refuses invalid end dates", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Later meeting", ...template, audienceKind: "everyone", rule: weeklyFrom(7) });
    const cases: [string, string][] = [
      ["2026-13-01", "valid end date"],
      ["12/01/2026", "valid end date"],
      [addDays(today(), -1), "today or a later date"],
      [addDays(today(), 3), "before the series starts"],
      [addDays(today(), 7 + 367), "at most one year"],
    ];
    for (const [endDate, message] of cases) await expect(f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate }), endDate).rejects.toThrow(message);
    expect((await f.t.run(ctx => ctx.db.get(seriesId)))?.untilDate).toBeUndefined();
  });

  it("never extends (or reopens) a split series into its successor's dates", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Build night", ...template, audienceKind: "everyone", rule: weeklyFrom(1) });
    await f.drain();
    const before = await sortedRows(f, seriesId);
    const splitKey = before[4].seriesOccurrenceKey!;
    const { seriesId: nextId } = await f.coach.mutation(api.eventSeries.editFuture, { seriesId, fromKey: splitKey, localStartTime: "19:00" });
    await f.drain();
    const details = await f.coach.query(api.eventSeries.endDateDetails, { seriesId, endDate: addDays(splitKey, 21) });
    expect(details).toMatchObject({ continuesFrom: splitKey, maxEndDate: addDays(splitKey, -1), preview: { problem: expect.stringContaining("continues as a newer series") } });
    for (const endDate of [splitKey, addDays(splitKey, 60)]) await expect(f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate })).rejects.toThrow("continues as a newer series");
    // An ended split series can't be reopened past its successor either.
    await f.t.run(ctx => ctx.db.patch(seriesId, { status: "ended" }));
    await expect(f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate: addDays(splitKey, 7) })).rejects.toThrow("continues as a newer series");
    await f.drain();
    // No date has meetings in both series.
    const keys = (await f.t.run(ctx => ctx.db.query("events").take(500))).filter(row => !row.cancelled).map(row => row.seriesOccurrenceKey);
    expect(new Set(keys).size).toBe(keys.length);
    // Shortening within the limit still works, and the successor keeps its meetings.
    await f.t.run(ctx => ctx.db.patch(seriesId, { status: "active" }));
    await f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate: addDays(before[1].seriesOccurrenceKey!, 1) });
    expect((await sortedRows(f, nextId)).every(row => !row.cancelled)).toBe(true);
  });

  it("refuses to cancel an app-only meeting that already has attendance", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Build night", ...template, audienceKind: "everyone", rule: weeklyFrom(1) });
    await f.drain();
    const rows = await sortedRows(f, seriesId);
    expect(rows[5].calendarEventId).toBeUndefined();
    await f.t.run(async ctx => {
      const meetingId = await ctx.db.insert("attendanceMeetings", { seasonId: f.ids.season, kind: "Tuesday", startsAt: rows[5].startsAt, cancelled: false, eventId: rows[5]._id });
      await ctx.db.insert("attendanceRecords", { meetingId, studentId: f.ids.students[0], present: true, recordedBy: f.ids.coach.id });
    });
    await expect(f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate: addDays(rows[2].seriesOccurrenceKey!, 1) })).rejects.toThrow("Attendance has already been taken");
    // After the meeting with attendance, shortening is fine.
    await expect(f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate: rows[5].seriesOccurrenceKey! })).resolves.toMatchObject({ cancelled: 2 });
  });

  it.each([
    ["linked to the meeting, recorded at its original time before it was moved", true, 0],
    ["not linked to an event, on the meeting's date at another time", false, 3 * 60 * 60_000],
  ])("finds attendance for a moved meeting: %s", async (_label, linked, offsetMs) => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Build night", ...template, audienceKind: "everyone", rule: weeklyFrom(1) });
    await f.drain();
    const rows = await sortedRows(f, seriesId);
    const original = rows[5].startsAt;
    // "This meeting only": the meeting moved one hour later.
    await f.coach.mutation(api.eventSeries.editOccurrence, { eventId: rows[5]._id, startsAt: original + 60 * 60_000, endsAt: rows[5].endsAt + 60 * 60_000 });
    await f.t.run(async ctx => {
      const meetingId = await ctx.db.insert("attendanceMeetings", { seasonId: f.ids.season, kind: "Tuesday", startsAt: original + offsetMs, cancelled: false, ...(linked ? { eventId: rows[5]._id } : {}) });
      await ctx.db.insert("attendanceRecords", { meetingId, studentId: f.ids.students[0], present: true, recordedBy: f.ids.coach.id });
    });
    await expect(f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate: addDays(rows[2].seriesOccurrenceKey!, 1) })).rejects.toThrow("Attendance has already been taken");
  });

  it("limits a split series by the split date even when the newer series starts later on other weekdays", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Build night", ...template, audienceKind: "everyone", rule: weeklyFrom(1) });
    await f.drain();
    const before = await sortedRows(f, seriesId);
    const splitKey = before[3].seriesOccurrenceKey!;
    // The newer series meets two days later in the week, so its first meeting is after the split date.
    const { seriesId: nextId } = await f.coach.mutation(api.eventSeries.editFuture, { seriesId, fromKey: splitKey, weekdays: [(weekdayOf(splitKey) + 2) % 7] });
    await f.drain();
    expect((await f.t.run(ctx => ctx.db.get(nextId)))!.startDate).toBe(addDays(splitKey, 2));
    expect(await f.coach.query(api.eventSeries.endDateDetails, { seriesId })).toMatchObject({ continuesFrom: splitKey, maxEndDate: addDays(splitKey, -1) });
    // The split date itself (an old-weekday date in the gap before the newer series' first meeting) is refused.
    await expect(f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate: splitKey })).rejects.toThrow("continues as a newer series");
    await expect(f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate: addDays(splitKey, 1) })).rejects.toThrow("continues as a newer series");
    const live = (await f.t.run(ctx => ctx.db.query("events").take(500))).filter(row => !row.cancelled && row.seriesOccurrenceKey! >= splitKey);
    expect(live.every(row => row.seriesId === nextId)).toBe(true);
  });
});

describe("change the end date of a Team Calendar series", () => {
  async function syntheticPrivateKey() {
    const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    return `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...bytes)).match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  }

  async function calendarFixture() {
    process.env.TIMECLOCK_CALENDAR_ID = calendarId;
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL = "service@example.invalid";
    process.env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY = await syntheticPrivateKey();
    process.env.STUDENT_STATUS_CALENDAR_WRITE_ENABLED = "true";
    process.env.CONVEX_CLOUD_URL = "https://amicable-eel-413.convex.cloud";
    const f = await fixture();
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(calendarId));
    const calendarIdHash = Array.from(new Uint8Array(bytes)).map(value => value.toString(16).padStart(2, "0")).join("");
    await f.t.run(ctx => ctx.db.insert("timeclockCalendarSync", { key: "team", calendarIdHash, timezone: "America/Chicago", generation: 1 }));
    return f;
  }

  type Call = { method: string; path: string; body?: Record<string, unknown>; ifMatch?: string | null };
  /**
   * A fake Google Calendar: masters keep their RRULE; instances are listed from the rule up to its UNTIL, with any instance
   * exceptions (PATCH on an instance id) applied. Instance etags change when an exception is written.
   */
  function fakeGoogle(masters: Map<string, Record<string, unknown>>, calls: Call[], beforeMasterPatch?: (master: Record<string, unknown>) => Promise<Response | void>) {
    const exceptions = new Map<string, Record<string, unknown>>();
    const instance = (masterId: string, master: Record<string, unknown>, startsAt: number, key: string) => ({
      id: googleInstanceId(masterId, startsAt), etag: `"i-${key}"`, status: "confirmed", summary: master.summary, location: master.location, recurringEventId: masterId,
      start: { dateTime: new Date(startsAt).toISOString() }, end: { dateTime: new Date(startsAt + 120 * 60_000).toISOString() }, originalStartTime: { dateTime: new Date(startsAt).toISOString() }, updated: "2026-11-01T12:00:00Z",
      ...exceptions.get(googleInstanceId(masterId, startsAt)),
    });
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
      const instanceMatch = /^(.+)_(\d{8}T\d{6}Z)$/.exec(parts[0] ?? "");
      if (instanceMatch && masters.has(instanceMatch[1])) {
        const basic = instanceMatch[2];
        const startsAt = Date.parse(`${basic.slice(0, 4)}-${basic.slice(4, 6)}-${basic.slice(6, 8)}T${basic.slice(9, 11)}:${basic.slice(11, 13)}:${basic.slice(13, 15)}Z`);
        if (method === "PATCH") exceptions.set(parts[0], { ...exceptions.get(parts[0]), ...body, etag: `"x-${exceptions.size + 1}"`, updated: "2026-11-02T12:00:00Z" });
        return new Response(JSON.stringify(instance(instanceMatch[1], masters.get(instanceMatch[1])!, startsAt, chicagoDate(startsAt))), { status: 200 });
      }
      const master = masters.get(parts[0]);
      if (!master) return new Response("{}", { status: 404 });
      if (parts[1] === "instances") {
        const start = master.start as { dateTime: string };
        const rrule = (master.recurrence as string[])[0];
        const byday = /BYDAY=([A-Z,]+)/.exec(rrule)![1].split(",").map(code => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"].indexOf(code));
        const until = /UNTIL=(\d{8}T\d{6}Z)/.exec(rrule)?.[1];
        const untilMs = until ? Date.parse(`${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}T${until.slice(9, 11)}:${until.slice(11, 13)}:${until.slice(13, 15)}Z`) : Infinity;
        const timeMin = Date.parse(url.searchParams.get("timeMin")!), timeMax = Date.parse(url.searchParams.get("timeMax")!);
        const items = occurrencesBetween({ anchorDate: start.dateTime.slice(0, 10), weekdays: byday, intervalWeeks: 1, startLocalTime: start.dateTime.slice(11, 16), durationMinutes: 120 }, chicagoDate(timeMin), chicagoDate(timeMax), 200)
          .filter(occurrence => occurrence.startsAt >= timeMin && occurrence.startsAt < timeMax && occurrence.startsAt <= untilMs)
          .map(occurrence => instance(parts[0], master, occurrence.startsAt, occurrence.occurrenceKey));
        return new Response(JSON.stringify({ items }), { status: 200 });
      }
      if (method === "PATCH") {
        const early = await beforeMasterPatch?.(master);
        if (early) return early;
        Object.assign(master, body, { etag: `"m${calls.filter(call => call.method === "PATCH" && !call.path.includes("_")).length + 1}"` });
        return new Response(JSON.stringify(master), { status: 200 });
      }
      return new Response(JSON.stringify(master), { status: 200 });
    });
  }

  const untilFor = (date: string) => `UNTIL=${formatUtcBasic(zonedWallTimeToUtc(addDays(date, 1), "00:00") - 1000)}`;
  /** Writes to the recurring master (instance ids contain "_"). */
  const masterPatches = (calls: Call[]) => calls.filter(call => call.method === "PATCH" && !call.path.includes("_"));

  it("extending moves the master's UNTIL later and links new meetings silently; shortening sets an earlier UNTIL (recurrence only, with if-match)", async () => {
    vi.useFakeTimers();
    const f = await calendarFixture();
    const masters = new Map<string, Record<string, unknown>>();
    const calls: Call[] = [];
    fakeGoogle(masters, calls);
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Team meeting", ...template, audienceKind: "everyone", rule: weeklyFrom(1, 15), addToCalendar: true });
    await f.drain();
    expect(await sortedRows(f, seriesId)).toHaveLength(3);
    const patches = () => masterPatches(calls);

    // Extending: only the recurrence's UNTIL moves later, then the new instances become linked meetings. No notices.
    const sentBefore = (await notifications(f)).length;
    const longEnd = addDays(today(), 200);
    await f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate: longEnd });
    await f.drain();
    expect(patches()).toHaveLength(1);
    expect(Object.keys(patches()[0].body!)).toEqual(["recurrence"]);
    expect(patches()[0].ifMatch).toBe('"m1"');
    expect((patches()[0].body!.recurrence as string[])[0]).toContain(untilFor(longEnd));
    const extended = await sortedRows(f, seriesId);
    expect(extended).toHaveLength(8);
    expect(extended.every(row => row.calendarChoice === "link" && !row.cancelled)).toBe(true);
    expect(await notifications(f)).toHaveLength(sentBefore);

    // Shortening: earlier UNTIL through the same recurrence-only PATCH; later meetings are canceled and unlinked.
    const shortEnd = addDays(extended[1].seriesOccurrenceKey!, 2);
    await f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate: shortEnd });
    await f.drain();
    expect(patches()).toHaveLength(2);
    expect(Object.keys(patches()[1].body!)).toEqual(["recurrence"]);
    expect((patches()[1].body!.recurrence as string[])[0]).toContain(untilFor(shortEnd));
    expect(calls.filter(call => call.method === "DELETE")).toHaveLength(0);
    const shortened = await sortedRows(f, seriesId);
    expect(shortened.map(row => row.cancelled ?? false)).toEqual([false, false, true, true, true, true, true, true]);
    expect(shortened.slice(2).every(row => row.calendarChoice === undefined)).toBe(true);
    expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ calendarSyncState: "synced", untilDate: shortEnd });
    const added = (await notifications(f)).slice(sentBefore);
    expect(new Set(added.map(row => row.userId)).size).toBe(added.length);

    // Extending again: the canceled meetings stay canceled here and their re-appearing instances are canceled in Team
    // Calendar too (instance exceptions), so no date is live there but canceled here. No new notices.
    const sentAfterShortening = (await notifications(f)).length;
    await f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate: longEnd });
    await f.drain();
    expect(patches()).toHaveLength(3);
    const reextended = await sortedRows(f, seriesId);
    expect(reextended.map(row => row.cancelled ?? false)).toEqual([false, false, true, true, true, true, true, true]);
    expect(reextended.every(row => row.calendarChoice === "link" && row.calendarSyncState === "synced")).toBe(true);
    const instanceCancels = calls.filter(call => call.method === "PATCH" && call.path.includes("_"));
    expect(instanceCancels.map(call => call.body)).toEqual(reextended.slice(2).map(() => ({ status: "cancelled" })));
    expect(new Set(instanceCancels.map(call => decodeURIComponent(call.path).split("/").at(-1)))).toEqual(new Set(reextended.slice(2).map(row => row.calendarEventId)));
    expect(await notifications(f)).toHaveLength(sentAfterShortening);
  });

  it("the Calendar job writes the series' latest end date, whatever order quick changes run in", async () => {
    vi.useFakeTimers();
    const f = await calendarFixture();
    const masters = new Map<string, Record<string, unknown>>();
    const calls: Call[] = [];
    fakeGoogle(masters, calls);
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Team meeting", ...template, audienceKind: "everyone", rule: weeklyFrom(1, 15), addToCalendar: true });
    await f.drain();
    const masterId = (await f.t.run(ctx => ctx.db.get(seriesId)))!.calendarMasterId!;

    // Two changes before either Calendar job runs: the earlier job already writes the later end; the second one skips.
    const first = addDays(today(), 100), second = addDays(today(), 60);
    await f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate: first });
    await f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate: second });
    await f.drain();
    expect(masterPatches(calls)).toHaveLength(1);
    expect((masters.get(masterId)!.recurrence as string[])[0]).toContain(untilFor(second));

    // A queued job carrying an older end is ignored: it reads the stored end and finds nothing to write.
    await f.t.action(internal.eventSeriesCalendar.setMasterUntil, { seriesId, untilMs: zonedWallTimeToUtc(addDays(first, 1), "00:00") - 1000 });
    expect(masterPatches(calls)).toHaveLength(1);
    expect((masters.get(masterId)!.recurrence as string[])[0]).toContain(untilFor(second));
    expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ untilDate: second, calendarSyncState: "synced" });
  });

  it.each([
    // Another end-date change commits while this job's write is in flight: the job sees the newer end and writes it too.
    ["the stored end changes during the write", false],
    // Another job wrote first (412) and hasn't stored its result yet: Google already has the latest end, which is success.
    ["another job wrote the latest end first (412)", true],
  ])("interleaved jobs leave Google on the latest stored end: %s", async (_label, conflict) => {
    vi.useFakeTimers();
    const f = await calendarFixture();
    const masters = new Map<string, Record<string, unknown>>();
    const calls: Call[] = [];
    const hooks: { interleave?: (master: Record<string, unknown>) => Promise<Response | void> } = {};
    fakeGoogle(masters, calls, master => hooks.interleave?.(master) ?? Promise.resolve());
    const { seriesId } = await f.coach.mutation(api.eventSeries.create, { name: "Team meeting", ...template, audienceKind: "everyone", rule: weeklyFrom(1, 15), addToCalendar: true });
    await f.drain();
    const masterId = (await f.t.run(ctx => ctx.db.get(seriesId)))!.calendarMasterId!;
    const first = addDays(today(), 100), latest = addDays(today(), 60);
    await f.coach.mutation(api.eventSeries.setEndDate, { seriesId, endDate: first });
    let fired = false;
    hooks.interleave = async master => {
      if (fired) return;
      fired = true;
      // The concurrent change (its own Calendar job isn't run here; only the retry can catch up).
      await f.t.run(ctx => ctx.db.patch(seriesId, { untilDate: latest }));
      if (!conflict) return;
      const rrule = (master.recurrence as string[])[0].replace(/;UNTIL=[^;]+/, "");
      Object.assign(master, { recurrence: [`${rrule};${untilFor(latest)}`], etag: '"other-job"' });
      return new Response("{}", { status: 412 });
    };
    await f.t.action(internal.eventSeriesCalendar.setMasterUntil, { seriesId });
    expect((masters.get(masterId)!.recurrence as string[])[0]).toContain(untilFor(latest));
    expect(await f.t.run(ctx => ctx.db.get(seriesId))).toMatchObject({ untilDate: latest, calendarSyncState: "synced" });
    expect((await f.t.run(ctx => ctx.db.get(seriesId)))?.calendarError).toBeUndefined();
    // Bounded: at most one write per attempt.
    expect(masterPatches(calls).length).toBeLessThanOrEqual(3);
  });
});
