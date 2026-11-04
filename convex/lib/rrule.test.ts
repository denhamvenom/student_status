import { describe, expect, it } from "vitest";
import { googleInstanceId, parseGoogleRecurrence, toGoogleRecurrence } from "./rrule";
import { firstOccurrence, type SeriesRule } from "./seriesRecurrence";

const base: SeriesRule = { anchorDate: "2026-11-03", weekdays: [2, 4], intervalWeeks: 2, startLocalTime: "18:00", durationMinutes: 120 };

describe("toGoogleRecurrence", () => {
  it.each([
    ["every other week until a winter date", { ...base, endsOnDate: "2026-12-15" }, "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;WKST=SU;UNTIL=20261216T055959Z"],
    ["until a summer date (CDT)", { ...base, endsOnDate: "2027-06-30" }, "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;WKST=SU;UNTIL=20270701T045959Z"],
    ["weekly with a count", { ...base, weekdays: [3, 1], intervalWeeks: 1, maxOccurrences: 10 }, "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10"],
    ["open-ended", { ...base, weekdays: [0] }, "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SU;WKST=SU"],
  ])("%s", (_label, rule, line) => {
    expect(toGoogleRecurrence(rule)).toEqual([line]);
  });

  it("adds Chicago EXDATEs at the series start time", () => {
    expect(toGoogleRecurrence(base, ["2026-11-05", "2026-11-03"])[1]).toBe("EXDATE;TZID=America/Chicago:20261103T180000,20261105T180000");
  });
});

describe("parseGoogleRecurrence round trip", () => {
  it.each([
    ["biweekly UNTIL across fall-back", { ...base, anchorDate: "2026-10-20", endsOnDate: "2026-12-15" }],
    ["biweekly COUNT", { ...base, maxOccurrences: 8 }],
    ["weekly Sunday+Saturday open-ended", { ...base, weekdays: [0, 6], intervalWeeks: 1, anchorDate: "2026-11-07" }],
    ["every 3 weeks with Sunday, UNTIL across spring-forward", { ...base, weekdays: [0, 3], intervalWeeks: 3, anchorDate: "2027-02-14", endsOnDate: "2027-04-30" }],
  ])("%s", (_label, rule) => {
    const first = firstOccurrence(rule)!;
    expect(first.occurrenceKey).toBe(rule.anchorDate);
    const parsed = parseGoogleRecurrence(toGoogleRecurrence(rule, ["2027-01-05"]), { date: first.occurrenceKey, time: rule.startLocalTime }, rule.durationMinutes);
    expect(parsed).toEqual({ ok: true, rule: { ...rule, weekdays: [...rule.weekdays].sort() }, exdates: ["2027-01-05"] });
  });
});

describe("parseGoogleRecurrence", () => {
  const start = { date: "2026-11-03", time: "18:00" };
  const parse = (lines: string[]) => parseGoogleRecurrence(lines, start, 120);

  it.each([
    ["exact last start in UTC", "UNTIL=20261118T000000Z", "2026-11-17"],
    ["a second before the last start", "UNTIL=20261117T235959Z", "2026-11-16"],
    ["date-only", "UNTIL=20261117", "2026-11-17"],
    ["floating local time before the start time", "UNTIL=20261117T170000", "2026-11-16"],
  ])("reads UNTIL as %s", (_label, until, endsOnDate) => {
    const parsed = parse([`RRULE:FREQ=WEEKLY;BYDAY=TU;${until}`]);
    expect(parsed.ok && parsed.rule.endsOnDate).toBe(endsOnDate);
  });

  it("defaults BYDAY to the start weekday, INTERVAL to 1, and accepts lowercase keys", () => {
    expect(parse(["rrule:freq=weekly;count=4"])).toEqual({ ok: true, rule: { anchorDate: "2026-11-03", weekdays: [2], intervalWeeks: 1, startLocalTime: "18:00", durationMinutes: 120, maxOccurrences: 4 }, exdates: [] });
  });

  it("reads EXDATEs in Chicago, UTC, date-only and other zones as Chicago dates", () => {
    const parsed = parse([
      "RRULE:FREQ=WEEKLY;BYDAY=TU,TH",
      "EXDATE;TZID=America/Chicago:20261103T180000,20261105T180000",
      "EXDATE:20261111T000000Z",
      "EXDATE;VALUE=DATE:20261112",
      "EXDATE;TZID=America/New_York:20261117T190000",
      "EXDATE;TZID=America/Los_Angeles:20261118T230000",
    ]);
    expect(parsed.ok && parsed.exdates).toEqual(["2026-11-03", "2026-11-05", "2026-11-10", "2026-11-12", "2026-11-17", "2026-11-19"]);
  });

  it("accepts every-other-week rules whose days don't straddle the week start", () => {
    expect(parse(["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH"]).ok).toBe(true);
    expect(parse(["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;WKST=WE"]).ok).toBe(false);
    expect(parseGoogleRecurrence(["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,TU;WKST=SU"], { date: "2026-11-01", time: "18:00" }, 60).ok).toBe(true);
    expect(parseGoogleRecurrence(["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,TU"], { date: "2026-11-01", time: "18:00" }, 60).ok).toBe(false);
  });

  it.each([
    ["daily", ["RRULE:FREQ=DAILY"], /repeats daily/],
    ["monthly", ["RRULE:FREQ=MONTHLY;BYDAY=1TU"], /repeats monthly/],
    ["numbered weekdays", ["RRULE:FREQ=WEEKLY;BYDAY=1TU"], /numbered weekdays/],
    ["BYSETPOS", ["RRULE:FREQ=WEEKLY;BYDAY=TU,TH;BYSETPOS=-1"], /position within the period/],
    ["BYMONTH", ["RRULE:FREQ=WEEKLY;BYDAY=TU;BYMONTH=11"], /specific months/],
    ["RDATE", ["RRULE:FREQ=WEEKLY;BYDAY=TU", "RDATE;TZID=America/Chicago:20261104T180000"], /extra one-off dates/],
    ["EXRULE", ["RRULE:FREQ=WEEKLY;BYDAY=TU", "EXRULE:FREQ=WEEKLY;BYDAY=TU;INTERVAL=4"], /skips dates by a rule/],
    ["two RRULEs", ["RRULE:FREQ=WEEKLY;BYDAY=TU", "RRULE:FREQ=WEEKLY;BYDAY=TH"], /more than one repeat rule/],
    ["no RRULE", ["EXDATE:20261111T000000Z"], /no repeat rule/],
    ["UNTIL and COUNT", ["RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3;UNTIL=20261201"], /both an end date and a meeting count/],
    ["start off-pattern", ["RRULE:FREQ=WEEKLY;BYDAY=WE"], /first meeting isn't on one of its repeat days/],
    ["interval too large", ["RRULE:FREQ=WEEKLY;INTERVAL=9;BYDAY=TU"], /every 1 to 8 weeks/],
    ["count too large", ["RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=150"], /1 to 104 meetings/],
    ["over a year", ["RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20280101"], /at most one year/],
    ["unknown time zone", ["RRULE:FREQ=WEEKLY;BYDAY=TU", "EXDATE;TZID=Mars/Olympus:20261110T180000"], /unknown time zone/],
  ])("refuses %s with a reason", (_label, lines, reason) => {
    const parsed = parse(lines);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toMatch(reason);
  });
});

describe("googleInstanceId", () => {
  it("appends the original UTC start", () => {
    expect(googleInstanceId("abc123", Date.parse("2026-11-04T00:00:00Z"))).toBe("abc123_20261104T000000Z");
  });
});
