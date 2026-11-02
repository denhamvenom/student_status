import { describe, expect, it } from "vitest";
import { isQuietHours, nextQuietHoursEnd } from "./quietHours";

// America/Chicago: CST = UTC-6 (winter), CDT = UTC-5 (summer).
describe("quiet hours", () => {
  it.each([
    ["Mon 07:29 CST", "2026-01-12T13:29:00Z", false],
    ["Mon 07:30 CST", "2026-01-12T13:30:00Z", true],
    ["Mon 15:00 CST", "2026-01-12T21:00:00Z", true],
    ["Mon 15:59 CST", "2026-01-12T21:59:00Z", true],
    ["Mon 16:00 CST", "2026-01-12T22:00:00Z", false],
    ["Sat 10:00 CST", "2026-01-17T16:00:00Z", false],
    ["Fri 10:00 CDT", "2026-07-10T15:00:00Z", true],
    ["Fri 07:29 CDT", "2026-07-10T12:29:00Z", false],
    ["Fri 15:59 CDT", "2026-07-10T20:59:00Z", true],
    ["Fri 16:00 CDT", "2026-07-10T21:00:00Z", false],
    // DST began Sun 2026-03-08: Mon 07:30 is CDT, 12:30Z; 16:00 CDT is 21:00Z.
    ["Mon after spring-forward 07:30 CDT", "2026-03-09T12:30:00Z", true],
    ["Mon after spring-forward 07:29 CDT", "2026-03-09T12:29:00Z", false],
    ["Mon after spring-forward 15:59 CDT", "2026-03-09T20:59:00Z", true],
    ["Mon after spring-forward 16:00 CDT", "2026-03-09T21:00:00Z", false],
    // DST ended Sun 2026-11-01: Mon 07:30 is CST, 13:30Z; 16:00 CST is 22:00Z.
    ["Mon after fall-back 07:30 CST", "2026-11-02T13:30:00Z", true],
    ["Mon after fall-back 06:30 CST", "2026-11-02T12:30:00Z", false],
    ["Mon after fall-back 15:30 CST (21:30Z, 16:30 under CDT)", "2026-11-02T21:30:00Z", true],
    ["Mon after fall-back 16:00 CST", "2026-11-02T22:00:00Z", false],
  ])("%s", (_name, iso, expected) => {
    expect(isQuietHours(Date.parse(iso))).toBe(expected);
  });

  it.each([
    ["winter", "2026-01-12T16:00:00Z", "2026-01-12T22:00:00Z"],
    ["summer", "2026-07-10T15:00:00Z", "2026-07-10T21:00:00Z"],
    ["Fri before spring-forward", "2026-03-06T16:00:00Z", "2026-03-06T22:00:00Z"],
    ["day after spring-forward", "2026-03-09T15:00:00Z", "2026-03-09T21:00:00Z"],
    ["Fri before fall-back", "2026-10-30T15:00:00Z", "2026-10-30T21:00:00Z"],
    ["day after fall-back", "2026-11-02T15:00:00Z", "2026-11-02T22:00:00Z"],
    ["one minute before the end", "2026-01-12T21:59:00Z", "2026-01-12T22:00:00Z"],
  ])("ends at 16:00 local (%s)", (_name, now, end) => {
    expect(nextQuietHoursEnd(Date.parse(now))).toBe(Date.parse(end));
  });

  it("returns now when not quiet", () => {
    const sat = Date.parse("2026-01-17T16:00:00Z");
    expect(nextQuietHoursEnd(sat)).toBe(sat);
    const afterEnd = Date.parse("2026-01-12T22:00:00Z");
    expect(nextQuietHoursEnd(afterEnd)).toBe(afterEnd);
  });
});
