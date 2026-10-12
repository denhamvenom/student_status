export type CalendarOccurrence = {
  sourceKey: string; title: string; allDay: boolean; scheduledStart?: number; scheduledEnd?: number;
  allDayStartDate?: string; allDayEndDate?: string; recurringEventId?: string;
  originalStartTime?: string; providerVersion?: string; providerUpdatedAt?: number;
  cancelled: boolean; observedAt: number; generation: number;
};

type DateField = { date?: unknown; dateTime?: unknown } | undefined;
type GoogleEvent = Record<string, unknown>;

function dateField(value: unknown): DateField {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DateField : undefined;
}

/** Google all-day end dates are exclusive; preserve their date form for Chicago UI. */
export function normalizeCalendarEvent(event: GoogleEvent, observedAt: number, generation: number): CalendarOccurrence | null {
  if (typeof event.id !== "string" || !event.id) return null;
  const start = dateField(event.start);
  const end = dateField(event.end);
  const cancelled = event.status === "cancelled";
  const allDay = typeof start?.date === "string";
  const out: CalendarOccurrence = {
    sourceKey: event.id, title: typeof event.summary === "string" ? event.summary : "Untitled event",
    allDay, cancelled, observedAt, generation,
  };
  if (typeof event.etag === "string") out.providerVersion = event.etag;
  if (typeof event.updated === "string") {
    const updated = Date.parse(event.updated);
    if (Number.isFinite(updated)) out.providerUpdatedAt = updated;
  }
  if (typeof event.recurringEventId === "string") out.recurringEventId = event.recurringEventId;
  const original = dateField(event.originalStartTime);
  if (typeof original?.dateTime === "string") out.originalStartTime = original.dateTime;
  else if (typeof original?.date === "string") out.originalStartTime = original.date;
  if (allDay && typeof start?.date === "string" && typeof end?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(start.date) && /^\d{4}-\d{2}-\d{2}$/.test(end.date) && end.date > start.date) {
    out.allDayStartDate = start.date;
    out.allDayEndDate = end.date;
  } else if (typeof start?.dateTime === "string" && typeof end?.dateTime === "string") {
    const a = Date.parse(start.dateTime); const b = Date.parse(end.dateTime);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      out.scheduledStart = a; out.scheduledEnd = b;
    }
  }
  if (!cancelled && !(out.allDayStartDate && out.allDayEndDate) && !(out.scheduledStart && out.scheduledEnd)) return null;
  return out;
}
