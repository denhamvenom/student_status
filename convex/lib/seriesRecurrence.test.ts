import { describe, expect, it } from "vitest";
import { firstOccurrence, occurrenceIndex, occurrencesBetween, splitRuleAt, validateSeriesRule, type SeriesRule } from "./seriesRecurrence";
import { zonedWallTimeToUtc } from "../../shared/chicago-time";

const at = (iso: string) => Date.parse(iso);
const keys = (rule: SeriesRule, from: string, to: string) => occurrencesBetween(rule, from, to).map(o => o.occurrenceKey);

// Tue/Thu every other week at 6 PM for two hours, starting Tue Oct 20 2026 (crosses the Nov 1 fall-back).
const biweekly: SeriesRule = { anchorDate: "2026-10-20", weekdays: [4, 2], intervalWeeks: 2, startLocalTime: "18:00", durationMinutes: 120 };

describe("occurrencesBetween", () => {
  it("repeats every other Sunday-start week on several weekdays with ordinals from the series start", () => {
    expect(occurrencesBetween(biweekly, "2026-10-01", "2026-11-21")).toEqual([
      { occurrenceKey: "2026-10-20", startsAt: at("2026-10-20T23:00:00Z"), endsAt: at("2026-10-21T01:00:00Z"), index: 0 },
      { occurrenceKey: "2026-10-22", startsAt: at("2026-10-22T23:00:00Z"), endsAt: at("2026-10-23T01:00:00Z"), index: 1 },
      { occurrenceKey: "2026-11-03", startsAt: at("2026-11-04T00:00:00Z"), endsAt: at("2026-11-04T02:00:00Z"), index: 2 },
      { occurrenceKey: "2026-11-05", startsAt: at("2026-11-06T00:00:00Z"), endsAt: at("2026-11-06T02:00:00Z"), index: 3 },
      { occurrenceKey: "2026-11-17", startsAt: at("2026-11-18T00:00:00Z"), endsAt: at("2026-11-18T02:00:00Z"), index: 4 },
      { occurrenceKey: "2026-11-19", startsAt: at("2026-11-20T00:00:00Z"), endsAt: at("2026-11-20T02:00:00Z"), index: 5 },
    ]);
    // A window starting mid-series keeps the series ordinals.
    expect(occurrencesBetween(biweekly, "2026-11-04", "2026-11-18").map(o => [o.occurrenceKey, o.index])).toEqual([["2026-11-05", 3], ["2026-11-17", 4]]);
    expect(keys(biweekly, "2026-11-19", "2026-11-19")).toEqual([]);
  });

  it("skips pattern days before a mid-week anchor and counts Sunday as the first day of the week", () => {
    const midWeek = { ...biweekly, anchorDate: "2026-10-21" };
    expect(occurrencesBetween(midWeek, "2026-10-01", "2026-11-06").map(o => [o.occurrenceKey, o.index])).toEqual([["2026-10-22", 0], ["2026-11-03", 1], ["2026-11-05", 2]]);
    const weekend: SeriesRule = { anchorDate: "2026-03-01", weekdays: [0, 6], intervalWeeks: 2, startLocalTime: "10:00", durationMinutes: 60 };
    expect(occurrencesBetween(weekend, "2026-03-01", "2026-03-21").map(o => [o.occurrenceKey, o.startsAt])).toEqual([
      ["2026-03-01", at("2026-03-01T16:00:00Z")], ["2026-03-07", at("2026-03-07T16:00:00Z")], ["2026-03-15", at("2026-03-15T15:00:00Z")],
    ]);
  });

  it.each([
    ["spring-forward 2026 skipped hour moves forward", "2026-03-01", 0, "02:30", ["2026-03-01T08:30:00Z", "2026-03-08T08:30:00Z", "2026-03-15T07:30:00Z"]],
    ["fall-back 2026 repeated hour uses the first (CDT) instant", "2026-10-25", 0, "01:30", ["2026-10-25T06:30:00Z", "2026-11-01T06:30:00Z", "2026-11-08T07:30:00Z"]],
    ["spring-forward 2027 evening meeting", "2027-03-08", 1, "18:00", ["2027-03-09T00:00:00Z", "2027-03-15T23:00:00Z", "2027-03-22T23:00:00Z"]],
    ["fall-back 2027 evening meeting", "2027-11-01", 1, "18:00", ["2027-11-01T23:00:00Z", "2027-11-09T00:00:00Z", "2027-11-16T00:00:00Z"]],
  ])("keeps local wall time across DST: %s", (_label, anchorDate, weekday, startLocalTime, starts) => {
    const rule: SeriesRule = { anchorDate, weekdays: [weekday], intervalWeeks: 1, startLocalTime, durationMinutes: 90 };
    const occurrences = occurrencesBetween(rule, anchorDate, "2028-01-01").slice(0, 3);
    expect(occurrences.map(o => o.startsAt)).toEqual(starts.map(at));
    expect(occurrences.every(o => o.endsAt - o.startsAt === 90 * 60_000)).toBe(true);
  });

  it.each([
    ["COUNT", { maxOccurrences: 3 }, ["2026-10-20", "2026-10-22", "2026-10-27"]],
    ["UNTIL is inclusive", { endsOnDate: "2026-10-27" }, ["2026-10-20", "2026-10-22", "2026-10-27"]],
  ])("honors %s", (_label, end, expected) => {
    const rule: SeriesRule = { anchorDate: "2026-10-20", weekdays: [2, 4], intervalWeeks: 1, startLocalTime: "18:00", durationMinutes: 60, ...end };
    expect(keys(rule, "2026-01-01", "2027-01-01")).toEqual(expected);
    expect(occurrencesBetween(rule, "2026-10-25", "2027-01-01").map(o => o.index)).toEqual([2]);
    expect(occurrenceIndex(rule, "2026-10-29")).toBeNull();
  });

  it("caps a long open-ended range at 200 and respects a smaller limit", () => {
    const daily: SeriesRule = { anchorDate: "2026-01-01", weekdays: [0, 1, 2, 3, 4, 5, 6], intervalWeeks: 1, startLocalTime: "07:00", durationMinutes: 30 };
    const all = occurrencesBetween(daily, "2026-01-01", "2030-01-01");
    expect(all).toHaveLength(200);
    expect(all.at(-1)?.index).toBe(199);
    expect(occurrencesBetween(daily, "2026-01-01", "2030-01-01", 5)).toHaveLength(5);
  });

  it("finds the first occurrence even when the anchor week is skipped by weekday", () => {
    expect(firstOccurrence({ ...biweekly, anchorDate: "2026-10-23", weekdays: [2] })?.occurrenceKey).toBe("2026-11-03");
  });
});

describe("zonedWallTimeToUtc", () => {
  it("resolves other zones for imported dates", () => {
    expect(zonedWallTimeToUtc("2026-11-17", "19:00", "America/New_York")).toBe(at("2026-11-18T00:00:00Z"));
  });
});

describe("validateSeriesRule", () => {
  const valid: SeriesRule = { ...biweekly, endsOnDate: "2027-05-01" };
  it("accepts a valid rule and an open-ended rule", () => {
    expect(validateSeriesRule(valid)).toEqual([]);
    expect(validateSeriesRule(biweekly)).toEqual([]);
    expect(validateSeriesRule({ ...biweekly, endsOnDate: "2027-10-20" })).toEqual([]);
  });
  it.each([
    ["no weekdays", { weekdays: [] }],
    ["duplicate weekday", { weekdays: [2, 2] }],
    ["weekday out of range", { weekdays: [7] }],
    ["interval 0", { intervalWeeks: 0 }],
    ["interval 9", { intervalWeeks: 9 }],
    ["duration 10", { durationMinutes: 10 }],
    ["duration 721", { durationMinutes: 721 }],
    ["both end kinds", { maxOccurrences: 4 }],
    ["count 105", { endsOnDate: undefined, maxOccurrences: 105 }],
    ["count 0", { endsOnDate: undefined, maxOccurrences: 0 }],
    ["end before start", { endsOnDate: "2026-10-19" }],
    ["end beyond one year", { endsOnDate: "2027-10-21" }],
    ["impossible end date", { endsOnDate: "2026-02-30" }],
    ["bad start date", { anchorDate: "2026-13-01" }],
    ["bad time", { startLocalTime: "24:00" }],
    ["unpadded time", { startLocalTime: "6:00" }],
  ])("rejects %s", (_label, change) => {
    expect(validateSeriesRule({ ...valid, ...change } as SeriesRule)).toHaveLength(1);
  });
});

describe("splitRuleAt", () => {
  it("splits a COUNT series into a dated head and a tail with the remaining count, preserving the interval phase", () => {
    const counted = { ...biweekly, maxOccurrences: 6 };
    const { before, after } = splitRuleAt(counted, "2026-11-05");
    expect(before).toEqual({ ...biweekly, endsOnDate: "2026-11-04" });
    expect(after).toEqual({ ...biweekly, anchorDate: "2026-11-05", maxOccurrences: 3 });
    const original = keys(counted, "2026-01-01", "2027-06-01");
    expect([...keys(before!, "2026-01-01", "2027-06-01"), ...keys(after, "2026-01-01", "2027-06-01")]).toEqual(original);
    expect(validateSeriesRule(before!)).toEqual([]);
    expect(validateSeriesRule(after)).toEqual([]);
  });

  it("keeps the end date for UNTIL series, returns no head at the first meeting, and refuses non-meeting dates", () => {
    const dated = { ...biweekly, endsOnDate: "2026-12-31" };
    expect(splitRuleAt(dated, "2026-11-17").after).toEqual({ ...dated, anchorDate: "2026-11-17" });
    expect(splitRuleAt(dated, "2026-10-20")).toEqual({ before: null, after: dated });
    expect(() => splitRuleAt(dated, "2026-10-27")).toThrow();
    expect(() => splitRuleAt(dated, "2027-01-12")).toThrow();
  });
});
