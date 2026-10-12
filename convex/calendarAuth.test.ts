import { describe, expect, it } from "vitest";
import { allowedAuthRedirect } from "./lib/authRedirect";
import { normalizeCalendarEvent } from "./lib/calendarNormalize";

describe("OAuth redirect allowlist", () => {
  const student = "https://students.example.test";
  const clock = "https://clock.example.test";
  it("accepts only configured entry paths", () => {
    expect(allowedAuthRedirect("/", student, clock)).toBe(`${student}/`);
    expect(allowedAuthRedirect(`${student}/invite-parent`, student, clock)).toBe(`${student}/invite-parent`);
    expect(allowedAuthRedirect(`${clock}/`, student, clock)).toBe(`${clock}/`);
  });
  it.each(["//evil.example/", "https://evil.example/", "https://clock.example.test.evil.example/", "javascript:alert(1)", "https://clock.example.test/admin", "https://clock.example.test@evil.example/", "https://clock.example.test/#fragment"])("rejects %s", value => {
    expect(() => allowedAuthRedirect(value, student, clock)).toThrow();
  });
});

describe("calendar normalization", () => {
  it("preserves recurring instance identity and distinct DST offsets", () => {
    const event = normalizeCalendarEvent({ id: "instance-1", recurringEventId: "series", originalStartTime: { dateTime: "2026-11-01T01:30:00-05:00" }, start: { dateTime: "2026-11-01T01:30:00-05:00" }, end: { dateTime: "2026-11-01T01:30:00-06:00" }, status: "confirmed" }, 100, 1);
    expect(event).toMatchObject({ sourceKey: "instance-1", recurringEventId: "series", scheduledStart: Date.parse("2026-11-01T01:30:00-05:00"), scheduledEnd: Date.parse("2026-11-01T01:30:00-06:00") });
  });
  it("keeps all-day exclusive end as dates", () => {
    expect(normalizeCalendarEvent({ id: "all-day", start: { date: "2026-10-12" }, end: { date: "2026-10-13" } }, 100, 1)).toMatchObject({ allDay: true, allDayStartDate: "2026-10-12", allDayEndDate: "2026-10-13" });
  });
  it("accepts a cancellation tombstone without a schedule", () => {
    expect(normalizeCalendarEvent({ id: "instance-1", status: "cancelled" }, 100, 2)).toMatchObject({ sourceKey: "instance-1", cancelled: true });
  });
  it("rejects an active event with no valid window so sync cannot reconcile it away", () => {
    expect(normalizeCalendarEvent({ id: "instance-1", status: "confirmed", start: { dateTime: "invalid" }, end: { dateTime: "invalid" } }, 100, 2)).toBeNull();
  });
});
