import { afterEach, describe, expect, it, vi } from "vitest";
import { hasElapsedSession, isEarlyClockOut, startVisibleClock } from "../apps/timeclock/src/visibleClock";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("visible Timeclock clock", () => {
  it("stops hidden updates and immediately expires an ended session on return", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    let hidden = false;
    const page = new EventTarget();
    Object.defineProperty(page, "hidden", { get: () => hidden });
    vi.stubGlobal("document", page);
    vi.stubGlobal("window", { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval });
    const updates: number[] = [];
    const stop = startVisibleClock(() => updates.push(Date.now()), 15000);

    vi.advanceTimersByTime(15000);
    expect(updates).toEqual([15000]);
    hidden = true;
    vi.advanceTimersByTime(45000);
    expect(updates).toEqual([15000]);
    hidden = false;
    page.dispatchEvent(new Event("visibilitychange"));
    expect(updates).toEqual([15000, 60000]);
    expect(hasElapsedSession(true, 30000, updates.at(-1)!, "open")).toBe(true);
    stop();
    vi.advanceTimersByTime(15000);
    expect(updates).toHaveLength(2);
  });
});

describe("early clock-out confirmation", () => {
  const end = Date.UTC(2026, 10, 4, 2, 0); // 8:00 PM Chicago
  it.each([
    ["before the scheduled end", end - 60_000, end, true],
    ["one millisecond before the scheduled end", end - 1, end, true],
    ["exactly at the scheduled end", end, end, false],
    // The session was extended past `end`; only the scheduled end matters, so no prompt.
    ["after the scheduled end while the session is extended", end + 60_000, end, false],
    ["with no scheduled end", end - 60_000, null, false],
    ["with an undefined end", end - 60_000, undefined, false],
    ["with an invalid end", end - 60_000, Number.NaN, false],
  ] as const)("decides %s", (_label, now, scheduledEnd, early) => {
    expect(isEarlyClockOut(now, scheduledEnd)).toBe(early);
  });
});
