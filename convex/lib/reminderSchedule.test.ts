import { describe, expect, it } from "vitest";
import { chicagoDayWindow, deadlineReminderDue, digestDue, HOUR_MS, isR6ParityMonday, remindersDue, shouldSendUnpaidReminder, DAY_MS } from "./reminderSchedule";

const at = (iso: string) => Date.parse(iso);

describe("Chicago day windows", () => {
  it.each([
    ["ordinary CST day", "2026-01-14T18:00:00Z", 1, "2026-01-15", "2026-01-15T06:00:00Z", 24],
    ["spring-forward day is 23 hours", "2026-03-07T20:00:00Z", 1, "2026-03-08", "2026-03-08T06:00:00Z", 23],
    ["fall-back day is 25 hours", "2026-10-31T20:00:00Z", 1, "2026-11-01", "2026-11-01T05:00:00Z", 25],
    ["late-evening local time is still today", "2026-01-15T05:30:00Z", 0, "2026-01-14", "2026-01-14T06:00:00Z", 24],
  ])("%s", (_label, now, offset, dateKey, start, hours) => {
    const window = chicagoDayWindow(at(now), offset);
    expect(window.dateKey).toBe(dateKey);
    expect(window.start).toBe(at(start));
    expect((window.end - window.start) / HOUR_MS).toBe(hours);
  });
});

describe("hourly schedule", () => {
  it.each([
    ["digest + R2 at 5 PM CST", "2026-01-14T23:00:00Z", true, ["r2PermissionMissing"]],
    ["digest + R2 at 5 PM CDT", "2026-06-10T22:00:00Z", true, ["r2PermissionMissing"]],
    ["R1 at 6 PM CDT", "2026-06-10T23:00:00Z", false, ["r1EventTomorrow"]],
    ["R6 on Monday 5 PM", "2026-01-12T23:00:00Z", true, ["r2PermissionMissing", "r6UnpaidBalance"]],
    ["R7 on Saturday 10 AM", "2026-01-17T16:00:00Z", false, ["r7SetupUnfinished"]],
    ["nothing local-hour bound at 4 PM", "2026-01-14T22:00:00Z", false, []],
  ])("%s", (_label, now, digest, extra) => {
    expect(digestDue(at(now))).toBe(digest);
    expect(remindersDue(at(now))).toEqual(["r3SignupCloses", "r4RoomingDeadline", "r5RequirementDue", ...extra]);
  });

  it("deadline reminders fire once the deadline is within 48h but not inside the last 24h", () => {
    const now = at("2026-01-14T18:00:00Z");
    expect(deadlineReminderDue(now, now + 48 * HOUR_MS)).toBe(true);
    expect(deadlineReminderDue(now, now + 48 * HOUR_MS + 1)).toBe(false);
    expect(deadlineReminderDue(now, now + 24 * HOUR_MS + 1)).toBe(true);
    expect(deadlineReminderDue(now, now + 24 * HOUR_MS)).toBe(false);
  });
});

describe("R6 unpaid balance cadence", () => {
  const parity = at("2026-01-19T23:00:00Z");
  const off = at("2026-01-12T23:00:00Z");
  it("alternates Mondays from the anchor, across DST", () => {
    expect(isR6ParityMonday(at("2026-01-05T23:00:00Z"))).toBe(true);
    expect(isR6ParityMonday(off)).toBe(false);
    expect(isR6ParityMonday(parity)).toBe(true);
    // 2026-03-09 (first Monday after spring-forward) is week 9 from the anchor: off; 2026-03-16 is on.
    expect(isR6ParityMonday(at("2026-03-09T22:00:00Z"))).toBe(false);
    expect(isR6ParityMonday(at("2026-03-16T22:00:00Z"))).toBe(true);
  });
  it.each([
    ["parity Monday, no due date", parity, [undefined], true],
    ["off Monday, no due date", off, [undefined], false],
    ["off Monday, due in 3 days", off, [off + 3 * DAY_MS], true],
    ["off Monday, due in 8 days", off, [off + 8 * DAY_MS], false],
    ["off Monday, already overdue", off, [off - DAY_MS], false],
  ])("%s", (_label, now, dueAts, expected) => {
    expect(shouldSendUnpaidReminder(now, dueAts)).toBe(expected);
  });
});
