export function startVisibleClock(onTick: () => void, intervalMs: number) {
  const tick = () => { if (!document.hidden) onTick(); };
  const interval = window.setInterval(tick, intervalMs);
  document.addEventListener("visibilitychange", tick);
  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", tick);
  };
}

export function hasElapsedSession(selected: boolean, effectiveEnd: number | null, now: number, clockState?: string) {
  return selected && (effectiveEnd === null || now >= effectiveEnd || (clockState !== undefined && clockState !== "open"));
}

/** A student clock-out needs confirmation only before the meeting's SCHEDULED end; extensions do not count, since sessions auto-close at the effective end. */
export function isEarlyClockOut(now: number, scheduledEnd: number | null | undefined) {
  return typeof scheduledEnd === "number" && Number.isFinite(scheduledEnd) && now < scheduledEnd;
}
