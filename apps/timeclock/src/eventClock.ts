import { chicagoDayBounds } from '../../../convex/lib/timeclock';

/** Stable subscription argument; database changes still update the live query. */
export function eventQueryTime(now: number) { return chicagoDayBounds(now).start; }

export function eventAvailableAt(event: { available: boolean; state: string; allDay: boolean; effectiveEnd: number | null; scheduledEnd: number | null }, now: number) {
  if (!event.available) return false;
  if (event.state === 'open') return event.effectiveEnd !== null && now < event.effectiveEnd;
  return event.state === 'unopened' && (event.allDay || (event.scheduledEnd !== null && now < event.scheduledEnd));
}

export function calendarStaleAt(calendar: { configured: boolean; error: string | null; lastSuccessAt: number | null }, now: number) {
  return !calendar.configured || !!calendar.error || !calendar.lastSuccessAt || now - calendar.lastSuccessAt > 180_000;
}
