export const HOUR_MS = 60 * 60 * 1000;
export const HALF_HOUR_MS = HOUR_MS / 2;
export const MAX_EXTENSION_MS = 4 * HOUR_MS;
export const MAX_GROUP_SIZE = 100;

export type EffectiveInterval = { inAt: number; outAt: number };

export function classifiedTime(intervals: EffectiveInterval[], scheduledStart: number, scheduledEnd: number, effectiveEnd: number) {
  let totalMs = 0;
  let earlyMs = 0;
  let scheduledMs = 0;
  let extendedMs = 0;
  let longestScheduledMs = 0;
  for (const interval of intervals) {
    if (!Number.isFinite(interval.inAt) || !Number.isFinite(interval.outAt) || interval.outAt <= interval.inAt) throw new Error("Invalid interval.");
    const overlap = (start: number, end: number) => Math.max(0, Math.min(interval.outAt, end) - Math.max(interval.inAt, start));
    const scheduledPart = overlap(scheduledStart, scheduledEnd);
    totalMs += interval.outAt - interval.inAt;
    earlyMs += overlap(Number.NEGATIVE_INFINITY, scheduledStart);
    scheduledMs += scheduledPart;
    extendedMs += overlap(scheduledEnd, effectiveEnd);
    longestScheduledMs = Math.max(longestScheduledMs, scheduledPart);
  }
  return { totalMs, earlyMs, scheduledMs, extendedMs, longestScheduledMs, qualifies: longestScheduledMs >= HOUR_MS };
}

export function assertNoOverlap(intervals: EffectiveInterval[]) {
  const ordered = [...intervals].sort((a, b) => a.inAt - b.inAt);
  for (let i = 1; i < ordered.length; i++) if (ordered[i].inAt < ordered[i - 1].outAt) throw new Error("Corrected intervals overlap another visit.");
}

export function assertIdempotencyKey(key: string) {
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(key)) throw new Error("Invalid command key.");
}

export function assertProfileId(profileId: string) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(profileId)) throw new Error("Invalid browser profile ID.");
}

const chicagoParts = (at: number) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const value = (name: string) => Number(parts.find(p => p.type === name)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
};

export function chicagoDayBounds(at: number) {
  if (!Number.isFinite(at)) throw new Error("Invalid time.");
  const local = chicagoParts(at);
  const midnight = (year: number, month: number, day: number) => {
    const target = Date.UTC(year, month - 1, day);
    let guess = target + 6 * HOUR_MS;
    for (let i = 0; i < 3; i++) {
      const p = chicagoParts(guess);
      const displayedUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
      guess = target - (displayedUtc - guess);
    }
    return guess;
  };
  return { start: midnight(local.year, local.month, local.day), end: midnight(local.year, local.month, local.day + 1) };
}

export function chicagoDateKey(at: number) {
  const p = chicagoParts(at);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
