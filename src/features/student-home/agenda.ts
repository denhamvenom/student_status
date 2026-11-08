import type { Id } from '../../../convex/_generated/dataModel'
import { resolveAudience, type AudienceEventFields } from '../../../convex/lib/eventAudienceRules'
import { eventLocation } from '@/lib/event-place'
import { TEAM_TIME_ZONE } from '../../../shared/chicago-time'
import { formatDateRange, formatMoney } from './format'

/*
 * "Next up" and "This week" for Student and Parent Home, read from app.listEvents (the events this viewer may see,
 * with the Student's own signup status; Parents get no status per row). Pure: every decision takes the browser's `now`.
 */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000
/** At most this many rows in "This week". */
export const MAX_THIS_WEEK = 5

export type AgendaStatus = 'confirmed' | 'pending' | 'waitlist'

/** One app.listEvents row, read loosely (the query returns v.any()). */
export type ListedEventRow = {
  event: AudienceEventFields & {
    _id: Id<'events'>
    name: string
    startsAt: number
    endsAt: number
    destination: string
    onsite?: boolean
    locationType?: string
    feeCents: number
    cancelled?: boolean
    archived?: boolean
  }
  participation: string | null
}

export type AgendaEvent = {
  eventId: Id<'events'>
  name: string
  startsAt: number
  endsAt: number
  /** Family-facing place: the destination, "DSHS STEM Center (on site)" or "Virtual (Discord)". */
  place: string
  feeCents: number
  required: boolean
  /** The Student's own signup; null when there is none or it is not known (Parent rows). */
  status: AgendaStatus | null
}

const isStatus = (value: string | null): value is AgendaStatus => value === 'confirmed' || value === 'pending' || value === 'waitlist'

/** Events a Student or Parent should see on Home: not canceled, archived or for mentors only; soonest first. */
export function toAgendaEvents(rows: readonly ListedEventRow[] | null | undefined): AgendaEvent[] {
  if (!Array.isArray(rows)) return []
  const events: AgendaEvent[] = []
  for (const row of rows) {
    const event = row?.event
    if (!event || event.cancelled || event.archived) continue
    const audience = resolveAudience(event)
    if (audience.kind === 'mentorsOnly') continue
    events.push({ eventId: event._id, name: event.name, startsAt: event.startsAt, endsAt: Math.max(event.startsAt, event.endsAt), place: eventLocation(event), feeCents: event.feeCents, required: audience.mandatory, status: isStatus(row.participation) ? row.participation : null })
  }
  return events.sort((a, b) => a.startsAt - b.startsAt || a.name.localeCompare(b.name))
}

/** Not over yet (an event that has started still counts until it ends). */
const notOver = (event: AgendaEvent, now: number) => event.endsAt > now

/** The Student is going: signed up, waiting for approval or on the waitlist, or the event is required. */
export const isOnAgenda = (event: AgendaEvent) => event.status !== null || event.required

/** The next event the Student is on or that is required for them; null when nothing is ahead. */
export function nextUp(events: readonly AgendaEvent[], now: number): AgendaEvent | null {
  return events.find(event => notOver(event, now) && isOnAgenda(event)) ?? null
}

/**
 * Up to five more events in the next seven days, soonest first, leaving out the Next up event.
 * Events the Student is on come first only by time; optional events they could join are listed too.
 */
export function thisWeek(events: readonly AgendaEvent[], now: number, exclude: Id<'events'> | null = null): AgendaEvent[] {
  return events.filter(event => event.eventId !== exclude && notOver(event, now) && event.startsAt < now + WEEK_MS).slice(0, MAX_THIS_WEEK)
}

const dayFormat = new Intl.DateTimeFormat('en-US', { timeZone: TEAM_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: TEAM_TIME_ZONE, hour: 'numeric', minute: '2-digit' })
const dateKeyFormat = new Intl.DateTimeFormat('en-US', { timeZone: TEAM_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

function clock(epoch: number) {
  const parts = timeFormat.formatToParts(epoch)
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  const minute = get('minute')
  return { time: minute === '00' ? get('hour') : `${get('hour')}:${minute}`, period: get('dayPeriod').toUpperCase() }
}

/**
 * "Tue Nov 3, 6–8 PM", "Sat Nov 7, 11 AM–1:30 PM", "Tue Nov 3, 6 PM" when it has no length,
 * or "Nov 21–23" for an event over several days.
 */
export function formatWhen(startsAt: number, endsAt: number) {
  if (dateKeyFormat.format(startsAt) !== dateKeyFormat.format(endsAt)) return formatDateRange(startsAt, endsAt)
  const day = dayFormat.format(startsAt).replace(',', '')
  const start = clock(startsAt)
  if (endsAt <= startsAt) return `${day}, ${start.time} ${start.period}`
  const end = clock(endsAt)
  return start.period === end.period ? `${day}, ${start.time}–${end.time} ${end.period}` : `${day}, ${start.time} ${start.period}–${end.time} ${end.period}`
}

/** "Free" or "$85". */
export const costLabel = (feeCents: number) => feeCents > 0 ? formatMoney(feeCents) : 'Free'

export const statusLabel: Record<AgendaStatus, string> = { confirmed: 'Signed up', pending: 'Waiting for approval', waitlist: 'Waitlisted' }

/** Required or Optional, with what it means. */
export const requiredBadge = (required: boolean) => required
  ? { label: 'Required', meaning: 'Everyone in the group is expected to go.' }
  : { label: 'Optional', meaning: 'Sign up only if you want to go.' }

/** "Tue Nov 3, 6–8 PM · DSHS STEM Center (on site) · Free · Signed up"; the status is left out when it is not known. */
export function agendaLine(event: AgendaEvent) {
  return [formatWhen(event.startsAt, event.endsAt), event.place, costLabel(event.feeCents), event.status ? statusLabel[event.status] : null].filter(Boolean).join(' · ')
}
