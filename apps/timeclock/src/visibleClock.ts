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
