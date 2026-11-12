import type { Doc } from "../_generated/dataModel";

const DAY = 86_400_000;
/** An event gets its own spreadsheets from 60 days before it starts until 7 days after it ends. Outside that window its files are frozen. */
export const EVENT_DAYS_AHEAD = 60;
export const EVENT_DAYS_AFTER = 7;
/** Longest event the window search expects; events running longer than this past their start are not listed (none exist today). */
export const LONGEST_EVENT_DAYS = 30;
/** At most this many files are written in one update; the rest wait for the next one, and the card says so. */
export const MAX_FILES_PER_RUN = 60;

export type SheetEventFields = Pick<Doc<"events">, "startsAt" | "endsAt" | "archived" | "cancelled" | "type" | "seriesId">;

/**
 * Whether an event gets per-event spreadsheets right now: not canceled or archived, not a regular Team meeting (type Team) or an
 * occurrence of a repeating meeting, starting within the next 60 days or ended within the last 7 (an event in progress counts).
 */
export function eventQualifies(event: SheetEventFields, now: number): boolean {
  if (event.archived || event.cancelled === true) return false;
  if (event.type === "Team" || event.seriesId !== undefined) return false;
  return event.startsAt <= now + EVENT_DAYS_AHEAD * DAY && event.endsAt >= now - EVENT_DAYS_AFTER * DAY;
}

/** Index bounds on `endsAt` that hold every qualifying event (the caller still checks each one with `eventQualifies`). */
export function eventWindowEnds(now: number): { from: number; to: number } {
  return { from: now - EVENT_DAYS_AFTER * DAY, to: now + (EVENT_DAYS_AHEAD + LONGEST_EVENT_DAYS) * DAY };
}

const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });

/** "{Event name} - {Mon D, YYYY}" in team time, plus " - {suffix}" for an event's Fees or travel emergency file. */
export function eventFileName(event: { name: string; startsAt: number }, suffix?: string): string {
  const base = `${event.name.trim()} - ${dateFormat.format(event.startsAt).replace(/\s+/g, " ")}`;
  return suffix ? `${base} - ${suffix}` : base;
}

/** File name for an event-scoped kind. The runner always passes the event for these kinds. */
export function eventKindTitle(info: { event: { name: string; startsAt: number } | null }, suffix?: string): string {
  if (!info.event) throw new Error("An event spreadsheet needs its event");
  return eventFileName(info.event, suffix);
}
