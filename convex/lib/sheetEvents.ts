import type { Doc } from "../_generated/dataModel";
import { teamTransportEnabled } from "./transportation";

const DAY = 86_400_000;
/** An event gets its own spreadsheets from 60 days before it starts until 7 days after it ends. Outside that window its files are frozen. */
export const EVENT_DAYS_AHEAD = 60;
export const EVENT_DAYS_AFTER = 7;
/** Longest event the window search expects; events running longer than this past their start are not listed (none exist today). */
export const LONGEST_EVENT_DAYS = 30;
/** At most this many files are written in one update; the files for the events furthest away wait until they get closer, and the card says so. */
export const MAX_FILES_PER_RUN = 150;

export type SheetEventFields = Pick<Doc<"events">, "startsAt" | "endsAt" | "archived" | "cancelled" | "type" | "seriesId">;
/** What decides whether an event needs a Travel emergency file. */
export type SheetTravelFields = Pick<Doc<"events">, "travel" | "transportEnabled" | "onsite" | "locationType" | "overnight" | "permissionRequired">;

/**
 * Whether an event gets per-event spreadsheets right now: not canceled or archived, not a regular Team meeting (type Team) or an
 * occurrence of a repeating meeting, starting within the next 60 days or ended within the last 7 (an event in progress counts).
 */
export function eventQualifies(event: SheetEventFields, now: number): boolean {
  if (event.archived || event.cancelled === true) return false;
  if (event.type === "Team" || event.seriesId !== undefined) return false;
  return event.startsAt <= now + EVENT_DAYS_AHEAD * DAY && event.endsAt >= now - EVENT_DAYS_AFTER * DAY;
}

/**
 * Owner decision (November 12, 2026): a Travel emergency file only for an event with team travel (team transport to an in-person, off-site
 * place), an overnight stay, or a required permission form.
 */
export function eventNeedsTravelEmergency(event: SheetTravelFields): boolean {
  const travels = !event.onsite && event.locationType !== "virtual" && teamTransportEnabled(event);
  return travels || event.overnight || event.permissionRequired;
}

/** Whether an event-scoped kind makes a file for this (qualifying) event. Only the Travel emergency file has its own rule. */
export function eventKindApplies(kind: string, event: SheetTravelFields): boolean {
  return kind !== "eventTravelEmergency" || eventNeedsTravelEmergency(event);
}

/** Index bounds on `endsAt` that hold every qualifying event (the caller still checks each one with `eventQualifies`). */
export function eventWindowEnds(now: number): { from: number; to: number } {
  return { from: now - EVENT_DAYS_AFTER * DAY, to: now + (EVENT_DAYS_AHEAD + LONGEST_EVENT_DAYS) * DAY };
}

const dateParts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" });

/** The start date in team time as YYYY-MM-DD, so files sort by date in Drive. */
export function eventFileDate(startsAt: number): string {
  const parts = Object.fromEntries(dateParts.formatToParts(startsAt).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** "{YYYY-MM-DD} {Event name}" (start date in team time), plus " - {suffix}" for an event's Fees or Travel emergency file. */
export function eventFileName(event: { name: string; startsAt: number }, suffix?: string): string {
  const base = `${eventFileDate(event.startsAt)} ${event.name.trim()}`;
  return suffix ? `${base} - ${suffix}` : base;
}

/** File name for an event-scoped kind. The runner always passes the event for these kinds. */
export function eventKindTitle(info: { event: { name: string; startsAt: number } | null }, suffix?: string): string {
  if (!info.event) throw new Error("An event spreadsheet needs its event");
  return eventFileName(info.event, suffix);
}
