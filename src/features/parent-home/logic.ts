import type { Id } from '../../../convex/_generated/dataModel'
import type { WhatsLeftItem } from '../student-home/contract'
import { agendaLine, formatWhen, statusLabel, thisWeek, type AgendaEvent } from '../student-home/agenda'
import type { ParentHomeSummary } from './contract'

export function groupWork(items: WhatsLeftItem[]) {
  return {
    parent: items.filter(item => item.owner === 'parent'),
    student: items.filter(item => item.owner === 'student'),
    coach: items.filter(item => item.owner === 'coach'),
  }
}

export const parentAllSet = (items: WhatsLeftItem[]) => groupWork(items).parent.length === 0

export function upcomingEvent(summary: ParentHomeSummary, now: number) {
  return summary.nextEvent && summary.nextEvent.startsAt >= now ? summary.nextEvent : null
}

export function paidPercent(chargedCents: number, paidCents: number) {
  if (chargedCents <= 0) return 0
  return Math.round(Math.min(1, Math.max(0, paidCents / chargedCents)) * 100)
}

export function parentItemHref(item: WhatsLeftItem, studentId?: string) {
  if (item.kind === 'healthProfile' || item.kind === 'firstRegistration') return `/setup?edit=1&step=${item.kind === 'healthProfile' ? 'health' : 'first'}${studentId ? `&student=${encodeURIComponent(studentId)}` : ''}`
  if (item.kind === 'permissionForm') return '/forms'
  if (item.kind === 'requiredPayment') return '/finances'
  return item.href
}

export function parentItemAction(item: WhatsLeftItem) {
  if (item.kind === 'healthProfile') return 'Fill in Health information'
  if (item.kind === 'firstRegistration') return 'Start FIRST registration'
  if (item.kind === 'permissionForm') return 'Sign permission form'
  if (item.kind === 'requiredPayment') return 'Review balance due'
  return item.href ? 'Open event' : null
}

export type ParentNext = {
  eventId: Id<'events'>
  name: string
  /** "Tue Nov 3, 6–8 PM · DSHS STEM Center (on site) · Free · Signed up" */
  line: string
  /** null when the event is not in the Parent's event list (Required/Optional is then not shown). */
  required: boolean | null
}

/**
 * The linked Student's next event for slide 1: the summary's next event (it knows the Student's signup status),
 * filled in with end time, place and cost from app.listEvents when the event is there.
 */
export function parentNext(summary: ParentHomeSummary, events: readonly AgendaEvent[], now: number): ParentNext | null {
  const next = upcomingEvent(summary, now)
  if (!next) return null
  const listed = events.find(event => event.eventId === next.eventId)
  if (listed) return { eventId: next.eventId, name: next.name, line: agendaLine({ ...listed, status: next.status }), required: listed.required }
  const line = [formatWhen(next.startsAt, next.startsAt), next.location, statusLabel[next.status]].filter(Boolean).join(' · ')
  return { eventId: next.eventId, name: next.name, line, required: null }
}

/** This week for Parents: the next seven days, without the event already shown as Next. */
export const parentWeek = (events: readonly AgendaEvent[], next: ParentNext | null, now: number) => thisWeek(events, now, next?.eventId ?? null)

// Forms page summary --------------------------------------------------------

type FormEvent = { eventId: string; name: string; startsAt: number; endsAt: number }
type FormCoverage = { eventId: string; state: 'required' | 'pending' | 'accepted' | 'correction' }

/**
 * What the parent Forms page says before (or instead of) the signing form, from permissions.workspace: the upcoming
 * events still needing a signed form (no coverage yet, or sent back for a correction), soonest first.
 */
export function formsSummary(input: { events: readonly FormEvent[]; coverage: readonly FormCoverage[]; signingPaused: boolean; now: number }) {
  const state = new Map(input.coverage.map(row => [row.eventId, row.state]))
  const needForm = input.events
    .filter(event => event.endsAt > input.now && (state.get(event.eventId) ?? 'required') !== 'accepted' && state.get(event.eventId) !== 'pending')
    .sort((a, b) => a.startsAt - b.startsAt)
  const message = needForm.length === 0 ? 'Nothing to sign right now.'
    : input.signingPaused ? 'Forms open soon — we’ll notify you.'
    : needForm.length === 1 ? '1 event needs a signed form.' : `${needForm.length} events need a signed form.`
  return { needForm, message }
}
