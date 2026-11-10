import { useId, useMemo, useState } from 'react'
import { Input } from './ui/input'

/**
 * Reusable event chooser: searchable, a date on every option, upcoming events first, past events folded away,
 * and events that share a name told apart by their date (and time when two share a day).
 *
 * Props:
 * - `events`  the choices. `_id` and `name` are required; `startsAt` is a millisecond timestamp. `detail` is an optional
 *             short line under the name (for example "2 open"). Order does not matter; the picker sorts them.
 * - `allowedIds` optional. When given, only events with these ids are offered (for example, the events a student is signed up for).
 * - `value`   the chosen event id, or null when nothing is chosen.
 * - `onChange` called with the chosen event id.
 * - `asOf`    the current time in milliseconds (pass a clock that ticks, never read the clock in a Convex query).
 *             Events that ended before it are "past". An event with no `endsAt` ends when it starts.
 * - `label`   visible label above the search box, for example "Choose an event".
 * - `emptyText` shown when `events` is empty.
 */
export type PickerEvent = { _id: string; name: string; startsAt: number; endsAt?: number; detail?: string }

const zone = 'America/Chicago'
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' })
const dayKey = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(at)

export const eventPickerCopy = {
  search: 'Search events',
  searchPlaceholder: 'Type a name or date',
  upcoming: 'Upcoming',
  past: (count: number) => `Past events (${count})`,
  none: 'No events match your search.',
  empty: 'No events to choose from.',
  chosen: 'Chosen',
} as const

/** "Tue, Nov 10, 2026", with the start time added only when another event with the same name starts the same day. */
export function eventPickerLabel(event: PickerEvent, all: readonly PickerEvent[]): string {
  const sameDay = all.some(other => other._id !== event._id && other.name === event.name && dayKey(other.startsAt) === dayKey(event.startsAt))
  return `${dayFmt.format(event.startsAt)}${sameDay ? ` · ${timeFmt.format(event.startsAt)}` : ''}`
}

/** Splits events into upcoming (soonest first) and past (latest first). */
export function splitEvents<E extends PickerEvent>(events: readonly E[], asOf: number): { upcoming: E[]; past: E[] } {
  const ended = (event: E) => (event.endsAt ?? event.startsAt) < asOf
  return {
    upcoming: events.filter(event => !ended(event)).sort((a, b) => a.startsAt - b.startsAt || a.name.localeCompare(b.name)),
    past: events.filter(ended).sort((a, b) => b.startsAt - a.startsAt || a.name.localeCompare(b.name)),
  }
}

/** The default choice: the next upcoming event, or the most recent past one when nothing is coming up. */
export function defaultEventId<E extends PickerEvent>(events: readonly E[], asOf: number): string | null {
  const { upcoming, past } = splitEvents(events, asOf)
  return upcoming[0]?._id ?? past[0]?._id ?? null
}

/** Case-insensitive match on the name or the printed date. */
export function filterEvents<E extends PickerEvent>(events: readonly E[], query: string, all: readonly PickerEvent[] = events): E[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return [...events]
  return events.filter(event => {
    const text = `${event.name} ${eventPickerLabel(event, all)}`.toLowerCase()
    return terms.every(term => text.includes(term))
  })
}

/** Keeps only the events whose id is allowed. `undefined` means no restriction. */
export function restrictEvents<E extends PickerEvent>(events: readonly E[], allowedIds: readonly string[] | undefined): E[] {
  if (!allowedIds) return [...events]
  const allowed = new Set(allowedIds)
  return events.filter(event => allowed.has(event._id))
}

export function EventPicker({ events: allEvents, allowedIds, value, onChange, asOf, label, emptyText = eventPickerCopy.empty }: {
  events: readonly PickerEvent[]
  /** Optional: only these event ids can be chosen. Others are not shown. */
  allowedIds?: readonly string[]
  value: string | null
  onChange: (eventId: string) => void
  asOf: number
  label: string
  emptyText?: string
}) {
  const [query, setQuery] = useState('')
  const inputId = useId()
  const events = useMemo(() => restrictEvents(allEvents, allowedIds), [allEvents, allowedIds])
  const { upcoming, past } = useMemo(() => splitEvents(events, asOf), [events, asOf])
  const shownUpcoming = filterEvents(upcoming, query, events)
  const shownPast = filterEvents(past, query, events)
  const searching = query.trim().length > 0
  const chosenIsPast = past.some(event => event._id === value)
  const option = (event: PickerEvent) => <li key={event._id}>
    <button type="button" aria-pressed={event._id === value} onClick={() => onChange(event._id)}
      className={`flex min-h-11 w-full flex-col items-start rounded-sm border px-3 py-2 text-left ${event._id === value ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted'}`}>
      <strong>{event.name}</strong>
      <span className="text-sm">{eventPickerLabel(event, events)}{event.detail ? ` · ${event.detail}` : ''}</span>
    </button>
  </li>
  if (!events.length) return <p role="status">{emptyText}</p>
  return <div className="flex flex-col gap-2">
    <label htmlFor={inputId} className="font-bold">{label}</label>
    <Input id={inputId} type="search" value={query} placeholder={eventPickerCopy.searchPlaceholder} aria-label={eventPickerCopy.search} onChange={event => setQuery(event.target.value)} />
    <div className="flex max-h-80 flex-col gap-2 overflow-y-auto" role="group" aria-label={label}>
      {shownUpcoming.length > 0 && <>
        <h3 className="text-sm font-bold uppercase">{eventPickerCopy.upcoming}</h3>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">{shownUpcoming.map(option)}</ul>
      </>}
      {shownPast.length > 0 && <details open={searching || chosenIsPast}>
        <summary className="min-h-11 cursor-pointer font-bold">{eventPickerCopy.past(shownPast.length)}</summary>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">{shownPast.map(option)}</ul>
      </details>}
      {shownUpcoming.length === 0 && shownPast.length === 0 && <p role="status">{eventPickerCopy.none}</p>}
    </div>
  </div>
}
