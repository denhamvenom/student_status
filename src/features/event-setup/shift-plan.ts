import { chicagoDisplayTime, chicagoInputTime, parseChicagoInput } from '@/lib/chicago-time'
import { eventSetupCopy } from '../../copy/event-setup-copy'

// Matches convex/lib/eventSignupExtras MAX_SHIFTS and saveShift's place limit.
export const MAX_SHIFTS = 100
const MAX_PLACES = 500

export type ShiftLimits = { min: number | null; max: number | null }
export type ShiftLimitsIssue = { field: 'min' | 'max'; message: string }

const wholeNumber = (text: string) => text.trim() === '' ? null : Number(text)

/** Reads the min/max inputs. Blank min means the backend default of 1; blank max means no limit. */
export function shiftLimits(min: string, max: string): ShiftLimits {
  return { min: wholeNumber(min), max: wholeNumber(max) }
}

/** The same rule as checkShiftSettings, in Coach-facing words, so the form can point at the field before saving. */
export function shiftLimitsIssue(min: string, max: string): ShiftLimitsIssue | null {
  const limits = shiftLimits(min, max)
  if (limits.max !== null && (!Number.isSafeInteger(limits.max) || limits.max < 1 || limits.max > MAX_SHIFTS)) return { field: 'max', message: eventSetupCopy.limits.max }
  if (limits.min !== null && (!Number.isSafeInteger(limits.min) || limits.min < 0 || limits.min > MAX_SHIFTS)) return { field: 'min', message: eventSetupCopy.limits.min }
  if (limits.max !== null && limits.min !== null && limits.min > limits.max) return { field: 'min', message: eventSetupCopy.limits.order }
  return null
}

/** Blank is no limit (null); otherwise a whole number from 1 to 500, or NaN when invalid. */
export function shiftPlaces(text: string) {
  const value = wholeNumber(text)
  if (value === null) return null
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_PLACES ? value : NaN
}

export type PlannedShift = { startsAt: number; endsAt: number; capacity: number | null }
export type ShiftPlanRequest = {
  /** YYYY-MM-DD in Central Time. */
  day: string
  /** HH:MM in Central Time. */
  from: string
  to: string
  blockMinutes: number
  capacity: string
  event: { startsAt: number; endsAt: number }
  existing: { startsAt: number; endsAt: number }[]
}
/** `overlapping` is how many existing shifts the new ones overlap (a warning, not an error). */
export type ShiftPlan = { shifts: PlannedShift[]; skipped: number; overlapping: number } | { issue: string }

/**
 * Back-to-back shifts from `from` to `to` on one Central Time day. A last block shorter than the rest
 * covers the remainder; shifts that already exist with the same times are skipped so a repeat click is safe.
 */
export function planShifts(request: ShiftPlanRequest): ShiftPlan {
  const copy = eventSetupCopy.plan
  const startsAt = parseChicagoInput(`${request.day}T${request.from}`), endsAt = parseChicagoInput(`${request.day}T${request.to}`)
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return { issue: copy.times }
  if (endsAt <= startsAt) return { issue: copy.order }
  if (!Number.isSafeInteger(request.blockMinutes) || request.blockMinutes < 15 || request.blockMinutes > 24 * 60) return { issue: copy.length }
  const capacity = shiftPlaces(request.capacity)
  if (Number.isNaN(capacity)) return { issue: copy.capacity }
  if (startsAt < request.event.startsAt || endsAt > request.event.endsAt) return { issue: copy.outside(`${chicagoDisplayTime(request.event.startsAt)} – ${chicagoDisplayTime(request.event.endsAt)}`) }
  const step = request.blockMinutes * 60_000, shifts: PlannedShift[] = []
  let skipped = 0
  for (let at = startsAt; at < endsAt; at += step) {
    const shift = { startsAt: at, endsAt: Math.min(at + step, endsAt), capacity }
    if (request.existing.some(s => s.startsAt === shift.startsAt && s.endsAt === shift.endsAt)) skipped++
    else shifts.push(shift)
    if (shifts.length > MAX_SHIFTS) break
  }
  if (!shifts.length) return { issue: copy.allExist }
  if (request.existing.length + shifts.length > MAX_SHIFTS) return { issue: copy.tooMany(MAX_SHIFTS - request.existing.length) }
  const overlapping = request.existing.filter(existing => shifts.some(shift => overlaps(shift, existing))).length
  return { shifts, skipped, overlapping }
}

type Span = { startsAt: number; endsAt: number }
// Back-to-back shifts don't overlap.
const overlaps = (a: Span, b: Span) => a.startsAt < b.endsAt && b.startsAt < a.endsAt

/** The existing shifts a shift overlaps, in time order. `ignore` is the shift being edited, which never overlaps itself. */
export function overlappingShifts<S extends Span & { shiftId?: string }>(shift: Span, existing: readonly S[], ignore?: string | null): S[] {
  return existing.filter(other => other.shiftId !== ignore && overlaps(shift, other)).sort((a, b) => a.startsAt - b.startsAt)
}

/** The Add/Edit form's end after the start moves: the shift keeps the length it had (1 hour when the length isn't usable). */
export function endFollowingStart(previousStart: string, previousEnd: string, nextStart: string): string {
  const before = parseChicagoInput(previousStart), after = parseChicagoInput(previousEnd), next = parseChicagoInput(nextStart)
  if (!Number.isFinite(next)) return previousEnd
  const length = Number.isFinite(before) && Number.isFinite(after) && after > before ? after - before : 60 * 60_000
  return chicagoInputTime(next + length)
}

/**
 * Times the empty Add form suggests: a 2-hour slot (shorter at the event's end) starting when the last shift ends,
 * or at the event start when there are none. Blank when the shifts already reach the event's end, so the form
 * never opens on a time that overlaps an existing shift.
 */
export function nextShiftTimes(event: Span, existing: readonly Span[]): { start: string; end: string } {
  const startsAt = Math.max(event.startsAt, ...existing.map(shift => shift.endsAt))
  if (startsAt >= event.endsAt) return { start: '', end: '' }
  return { start: chicagoInputTime(startsAt), end: chicagoInputTime(Math.min(startsAt + 2 * 60 * 60_000, event.endsAt)) }
}

/** Inline problem with a hand-entered shift's times, or null when it can be saved. */
export function shiftTimesIssue(start: string, end: string, event: Span): string | null {
  const copy = eventSetupCopy.shifts, startsAt = parseChicagoInput(start), endsAt = parseChicagoInput(end)
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return copy.invalidTimes
  if (endsAt <= startsAt) return copy.endBeforeStart
  if (startsAt < event.startsAt || endsAt > event.endsAt) return copy.outsideWindow(eventWindow(event))
  return null
}

const chicago = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', ...options })
const dayFormat = chicago({ weekday: 'short', month: 'short', day: 'numeric' })
const timeFormat = chicago({ hour: 'numeric', minute: '2-digit' })

/** "Sat, Nov 7, 9:00 AM – 5:00 PM", with the end day added when the event crosses midnight. */
export function eventWindow(event: Span) {
  const startDay = dayFormat.format(event.startsAt), endDay = dayFormat.format(event.endsAt)
  return `${startDay}, ${timeFormat.format(event.startsAt)} – ${endDay === startDay ? '' : `${endDay}, `}${timeFormat.format(event.endsAt)}`
}

/** "3:00–5:00 PM"; the first AM/PM is dropped when both ends share it. */
export function timeSpan(startsAt: number, endsAt: number) {
  const start = timeFormat.format(startsAt), end = timeFormat.format(endsAt)
  return start.slice(-2) === end.slice(-2) ? `${start.slice(0, -3)}–${end}` : `${start}–${end}`
}

/** Open places in a shift; null when it has no limit. */
export const openSpots = (shift: { capacity: number | null; students: readonly unknown[] }) => shift.capacity === null ? null : Math.max(0, shift.capacity - shift.students.length)

/** Roster order: most open spots first, shifts with no limit last, ties by start time. */
export function byMostOpen<S extends Span & { capacity: number | null; students: readonly unknown[] }>(shifts: readonly S[]): S[] {
  const rank = (shift: S) => openSpots(shift) ?? -1
  return [...shifts].sort((a, b) => rank(b) - rank(a) || a.startsAt - b.startsAt)
}

/** "Sat, Nov 7 · 9:00 AM – 11:00 AM", with the end day repeated only when the shift crosses midnight. */
export function shiftTime(startsAt: number, endsAt: number) {
  const startDay = dayFormat.format(startsAt), endDay = dayFormat.format(endsAt)
  return `${startDay} · ${timeFormat.format(startsAt)} – ${endDay === startDay ? '' : `${endDay} · `}${timeFormat.format(endsAt)}`
}

export const shiftName = (shift: { label: string | null; startsAt: number; endsAt: number }) => shift.label ? `${shift.label} (${shiftTime(shift.startsAt, shift.endsAt)})` : shiftTime(shift.startsAt, shift.endsAt)
