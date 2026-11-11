// Synthetic data for the local `?review=` screens. Every total, count and status shown on those
// screens is derived from the tables below so the screens cannot disagree with each other.
import { events as baseEvents, students, type EventView, type StudentView } from '../../fixtures'

export const REVIEW_TODAY = '2026-11-09'

export type ReqKey = 'payment' | 'permission' | 'first' | 'room'
export type ReqState = 'done' | 'open' | 'pending'
export type Reqs = Record<ReqKey, ReqState>

export interface ReviewEvent extends EventView { startsOn: string; past: boolean }

const startsOn: Record<string, string> = { E1: '2027-03-04', E2: '2027-04-01', E3: '2026-10-24', E4: '2026-11-02', E5: '2026-11-14', E7: '2026-11-20' }

export const reviewEvents: ReviewEvent[] = baseEvents
  .map(e => ({ ...e, startsOn: startsOn[e.id], past: startsOn[e.id] < REVIEW_TODAY }))
  .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
export const upcomingEvents = reviewEvents.filter(e => !e.past)
export const pastEvents = reviewEvents.filter(e => e.past)
export const eventById = (id: string) => reviewEvents.find(e => e.id === id)
/** Events that have per-student requirements (Competitions with travel plans). */
export const requirementEventIds = ['E1', 'E2']

// ---- Money ----------------------------------------------------------------

export interface FeeLine { key: string; label: string; eventId?: string; charged: number; paid: number; source?: 'payment' | 'credit'; paidOn?: string }

export const feeLines: Record<string, FeeLine[]> = {
  A: [
    { key: 'team', label: 'Team Fee', charged: 150, paid: 150, source: 'payment', paidOn: 'Sep 1, 2026' },
    { key: 'E1', label: 'Regional 1', eventId: 'E1', charged: 450, paid: 120, source: 'credit', paidOn: 'Oct 12, 2026' },
    { key: 'E2', label: 'Regional 2', eventId: 'E2', charged: 520, paid: 0 },
    { key: 'food', label: 'Food fee', charged: 60, paid: 0 },
    { key: 'shirt', label: 'Extra shirt', charged: 20, paid: 0 },
  ],
  D: [
    { key: 'team', label: 'Team Fee', charged: 150, paid: 150, source: 'payment', paidOn: 'Sep 3, 2026' },
    { key: 'E1', label: 'Regional 1', eventId: 'E1', charged: 450, paid: 135, source: 'credit', paidOn: 'Oct 12, 2026' },
    { key: 'food', label: 'Food fee', charged: 60, paid: 0 },
  ],
}
/** Other students: totals only (their own pages are not part of the review). */
const otherTotals: Record<string, { charged: number; paid: number }> = {
  B: { charged: 1200, paid: 1200 }, C: { charged: 210, paid: 210 }, E: { charged: 1200, paid: 1200 }, F: { charged: 210, paid: 150 },
  H: { charged: 1200, paid: 1200 }, P: { charged: 1200, paid: 1200 }, Q: { charged: 1200, paid: 600 }, R: { charged: 1200, paid: 1200 },
}
export const fundraisingCredit = 175
export const raisedForTeam = 350

export interface Money { charged: number; paid: number; due: number }
export function moneyFor(id: string): Money {
  const lines = feeLines[id]
  const t = lines ? { charged: lines.reduce((n, l) => n + l.charged, 0), paid: lines.reduce((n, l) => n + l.paid, 0) } : otherTotals[id] ?? { charged: 0, paid: 0 }
  return { ...t, due: t.charged - t.paid }
}
export const moneyRows = students.map(s => ({ id: s.id, name: s.name, ...moneyFor(s.id) }))
export const teamMoney: Money = moneyRows.reduce((t, r) => ({ charged: t.charged + r.charged, paid: t.paid + r.paid, due: t.due + r.due }), { charged: 0, paid: 0, due: 0 })
/** Fundraising credit not yet used to pay a fee. */
export const availableFunds = (id: string) => fundraisingCredit - (feeLines[id] ?? []).filter(l => l.source === 'credit').reduce((n, l) => n + l.paid, 0)
/** Fees that are not counted until a Coach or Travel Lead approves the signup. */
export const waitingFees = (id: string) => participationFor(id, 'E5') === 'Waiting for approval' ? [{ label: 'Offseason Event 2', amount: 35 }] : []

// ---- Participation and requirements ---------------------------------------

const waiting = new Set(['D'])
export function participationFor(studentId: string, eventId: string): string {
  const e = eventById(eventId)
  if (!e || e.past) return 'Past event'
  if (eventId === 'E5' && waiting.has(studentId)) return 'Waiting for approval'
  return requirements[studentId]?.[eventId] ? 'Signed up' : 'Not signed up'
}

const done: Reqs = { payment: 'done', permission: 'done', first: 'done', room: 'done' }
const both = (r: Partial<Reqs>): Record<string, Reqs> => ({ E1: { ...done, ...r }, E2: { ...done, ...r } })
export const requirements: Record<string, Record<string, Reqs>> = {
  A: { E1: { payment: 'open', permission: 'done', first: 'open', room: 'open' }, E2: { payment: 'open', permission: 'pending', first: 'open', room: 'done' } },
  D: { E1: { payment: 'open', permission: 'open', first: 'done', room: 'done' } },
  B: both({}), E: both({}), P: both({}), R: both({}),
  H: both({ first: 'open' }), Q: both({ payment: 'open', room: 'open' }),
}
export const requirementLabels: Record<ReqKey, string> = { payment: 'Balance due', permission: 'Permission form', first: 'FIRST registration', room: 'Choose your room' }

/** Requirements that apply to a student for an event (Room only on overnight events). */
export function reqsFor(studentId: string, eventId: string): Partial<Reqs> | null {
  const r = requirements[studentId]?.[eventId]
  if (!r) return null
  return eventById(eventId)?.overnight ? r : { payment: r.payment, permission: r.permission, first: r.first }
}
export const isOpen = (s: ReqState | undefined) => s !== undefined && s !== 'done'
export function openCount(studentId: string, eventId: string) {
  const r = reqsFor(studentId, eventId)
  return r ? Object.values(r).filter(isOpen).length : 0
}
export const studentReady = (s: StudentView) => requirementEventIds.every(id => openCount(s.id, id) === 0)
export const travelStudents = students.filter(s => s.travelTeam)
/** Travel Team students with any open requirement for the event. */
export const studentsOpenFor = (eventId: string) => travelStudents.filter(s => openCount(s.id, eventId) > 0).length
export const roomsOpenFor = (eventId: string) => eventById(eventId)?.overnight ? travelStudents.filter(s => isOpen(requirements[s.id]?.[eventId]?.room)).length : 0
export const needsAttention = students.filter(s => !studentReady(s))

/** What a student sees on an event card. */
export function readinessLabel(studentId: string, eventId: string, staff = false): string {
  if (eventById(eventId)?.past) return 'Past event'
  if (!requirementEventIds.includes(eventId)) return 'Not applicable'
  if (staff) { const n = studentsOpenFor(eventId); return n ? `${n} students open` : 'Ready' }
  if (participationFor(studentId, eventId) !== 'Signed up') return 'Not applicable'
  const n = openCount(studentId, eventId)
  return n ? `${n} open` : 'Ready'
}

// ---- What's left -----------------------------------------------------------

export interface LeftItem { id: string; group: string; title: string; due: string; state: ReqState; action: string; href: string }
const due: Record<string, string> = { E1: 'Feb 15, 2027', E2: 'Mar 15, 2027' }
export function leftFor(studentId: string, role: 'student' | 'parent'): LeftItem[] {
  const out: LeftItem[] = []
  const season = requirements[studentId]?.E1
  if (season && isOpen(season.first)) out.push({ id: 'first', group: 'This season', title: 'FIRST registration', due: 'Jan 15, 2027', state: season.first, action: 'View instructions', href: '/first' })
  for (const id of requirementEventIds) {
    const e = eventById(id)!, r = reqsFor(studentId, id)
    if (!r || participationFor(studentId, id) !== 'Signed up') continue
    if (isOpen(r.room)) out.push({ id: `${id}-room`, group: e.name, title: 'Choose your room', due: 'Jan 15, 2027', state: r.room!, action: 'Choose your room', href: `/events/${id}/rooming` })
    if (isOpen(r.payment)) out.push({ id: `${id}-payment`, group: e.name, title: 'Balance due', due: due[id], state: r.payment!, action: 'Open Money', href: '/finances' })
    if (isOpen(r.permission)) out.push({ id: `${id}-permission`, group: e.name, title: 'Permission form', due: due[id], state: r.permission!, action: r.permission === 'pending' ? 'See details' : role === 'parent' ? 'Open permission form' : 'See details', href: r.permission === 'open' && role === 'parent' ? '/forms' : `/events/${id}/requirements` })
  }
  return out
}
