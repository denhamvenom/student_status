import { describe, expect, it } from "vitest";
import { assertNoOverlap, chicagoDayBounds, classifiedTime, HOUR_MS } from "./timeclock";

describe("timeclock attendance math", () => {
  it("requires one uninterrupted scheduled hour; separate visits never combine", () => {
    const start = 10 * HOUR_MS;
    const end = 12 * HOUR_MS;
    const visits = classifiedTime([{ inAt: start, outAt: start + 30 * 60_000 }, { inAt: start + HOUR_MS, outAt: start + HOUR_MS + 30 * 60_000 }], start, end, end);
    expect(visits.scheduledMs).toBe(HOUR_MS);
    expect(visits.qualifies).toBe(false);
    expect(classifiedTime([{ inAt: start, outAt: start + HOUR_MS }], start, end, end).qualifies).toBe(true);
    expect(classifiedTime([{ inAt: start, outAt: start + HOUR_MS - 1 }], start, end, end).qualifies).toBe(false);
  });

  it("separates early, scheduled, and extended minutes", () => {
    const start = 10 * HOUR_MS;
    const end = 11 * HOUR_MS;
    const result = classifiedTime([{ inAt: start - 20 * 60_000, outAt: end + 30 * 60_000 }], start, end, end + HOUR_MS);
    expect(result).toMatchObject({ earlyMs: 20 * 60_000, scheduledMs: HOUR_MS, extendedMs: 30 * 60_000, qualifies: true });
    expect(result.totalMs).toBe(result.earlyMs + result.scheduledMs + result.extendedMs);
  });

  it("rejects overlapping corrected visits", () => {
    expect(() => assertNoOverlap([{ inAt: 10, outAt: 20 }, { inAt: 19, outAt: 30 }])).toThrow("overlap");
    assertNoOverlap([{ inAt: 10, outAt: 20 }, { inAt: 20, outAt: 30 }]);
  });

  it("uses Chicago day boundaries across DST transitions", () => {
    const spring = chicagoDayBounds(Date.parse("2026-03-08T18:00:00Z"));
    const fall = chicagoDayBounds(Date.parse("2026-11-01T18:00:00Z"));
    expect(spring.end - spring.start).toBe(23 * HOUR_MS);
    expect(fall.end - fall.start).toBe(25 * HOUR_MS);
  });
});
