import { describe, expect, it } from "vitest";
import { calendarSyncStale, isCalendarRefreshSlot, latestCalendarRefreshSlot } from "./calendarSchedule";
const at = (date: string) => Date.parse(date);

describe("Chicago Calendar refresh schedule", () => {
  it.each([
    ["2026-03-07", 12, 21], ["2026-03-08", 11, 20],
    ["2026-10-31", 11, 20], ["2026-11-01", 12, 21],
  ])("runs exactly twice across DST on %s", (date, morning, afternoon) => {
    const slots = [11, 12, 20, 21].filter(hour => isCalendarRefreshSlot(at(`${date}T${hour}:00:00Z`)));
    expect(slots).toEqual([morning, afternoon]);
    expect(isCalendarRefreshSlot(at(`${date}T${morning}:01:00Z`))).toBe(true);
    expect(isCalendarRefreshSlot(at(`${date}T${morning}:59:59Z`))).toBe(true);
    expect(isCalendarRefreshSlot(at(`${date}T${morning + 1}:00:00Z`))).toBe(false);
  });

  it("finds the prior day's slot across the DST change", () => {
    expect(latestCalendarRefreshSlot(at("2026-03-08T10:00:00Z"))).toBe(at("2026-03-07T21:00:00Z"));
    expect(latestCalendarRefreshSlot(at("2026-11-01T11:59:59Z"))).toBe(at("2026-10-31T20:00:00Z"));
    expect(latestCalendarRefreshSlot(at("2026-11-01T12:00:00Z"))).toBe(at("2026-11-01T12:00:00Z"));
  });

  it("waits five minutes for the latest slot and accepts successful manual refreshes", () => {
    const base = { configured: true, error: null, lastSuccessAt: at("2026-10-20T20:01:00Z") };
    expect(calendarSyncStale({ ...base, now: at("2026-10-21T11:04:59Z") })).toBe(false);
    expect(calendarSyncStale({ ...base, now: at("2026-10-21T11:05:00Z") })).toBe(true);
    expect(calendarSyncStale({ ...base, lastSuccessAt: at("2026-10-21T11:00:00Z"), now: at("2026-10-21T19:59:00Z") })).toBe(false);
    expect(calendarSyncStale({ ...base, lastSuccessAt: at("2026-10-21T19:59:00Z"), now: at("2026-10-21T20:05:00Z") })).toBe(true);
    for (const override of [{ configured: false }, { error: "failed" }, { lastSuccessAt: null }]) {
      expect(calendarSyncStale({ ...base, ...override, now: at("2026-10-21T10:00:00Z") })).toBe(true);
    }
  });
});
