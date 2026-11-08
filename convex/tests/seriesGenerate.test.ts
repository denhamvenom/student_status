import { describe, expect, it } from "vitest";
import { chicagoLocalDateTime, masterIdForSeries, sameRecurrence, truncateRecurrence } from "../lib/seriesGenerate";
import { zonedWallTimeToUtc } from "../../shared/chicago-time";

describe("series master helpers", () => {
  it.each([
    ["adds UNTIL to an open rule", ["RRULE:FREQ=WEEKLY;BYDAY=TU"], ["RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261110T005959Z"]],
    ["converts COUNT to UNTIL", ["RRULE:FREQ=WEEKLY;COUNT=30;BYDAY=TU,TH"], ["RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261110T005959Z"]],
    ["replaces an old UNTIL and keeps EXDATE", ["EXDATE;TZID=America/Chicago:20261020T190000", "RRULE:FREQ=WEEKLY;UNTIL=20270601T045959Z;BYDAY=TU"], ["EXDATE;TZID=America/Chicago:20261020T190000", "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261110T005959Z"]],
  ])("truncateRecurrence %s", (_label, lines, expected) => {
    // UNTIL is always written in UTC Z form.
    expect(truncateRecurrence(lines, Date.parse("2026-11-10T00:59:59Z"))).toEqual(expected);
  });

  it("refuses to truncate recurrence lines without a repeat rule", () => {
    expect(() => truncateRecurrence(["EXDATE:20261020T000000Z"], 0)).toThrow("no repeat rule");
  });

  it("builds a stable base32hex master id that differs per series doc", async () => {
    const a = await masterIdForSeries("series-a"), b = await masterIdForSeries("series-b");
    expect(a).toMatch(/^sr[0-9a-f]{40}$/);
    expect(await masterIdForSeries("series-a")).toBe(a);
    expect(b).not.toBe(a);
  });

  it("compares recurrence lines without part-order noise and keeps wall time across DST", () => {
    expect(sameRecurrence(["RRULE:FREQ=WEEKLY;BYDAY=TU;INTERVAL=2;WKST=SU"], ["rrule:wkst=su;interval=2;freq=weekly;byday=tu"])).toBe(true);
    expect(sameRecurrence(["RRULE:FREQ=WEEKLY;BYDAY=TU"], ["RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261110T005959Z"])).toBe(false);
    expect(chicagoLocalDateTime(zonedWallTimeToUtc("2026-10-27", "19:00"))).toBe("2026-10-27T19:00:00");
    expect(chicagoLocalDateTime(zonedWallTimeToUtc("2026-11-03", "19:00"))).toBe("2026-11-03T19:00:00");
  });
});
