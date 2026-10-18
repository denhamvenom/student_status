import { afterEach, describe, expect, it, vi } from "vitest";
import { hasElapsedSession, startVisibleClock } from "../apps/timeclock/src/visibleClock";

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
