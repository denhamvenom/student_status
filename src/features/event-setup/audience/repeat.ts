// Tiny local calculator for weekly repeating meetings, used for the setup preview and validation.
// Works on calendar dates (YYYY-MM-DD) in UTC milliseconds so daylight saving never shifts a day.
// The backend owns the real series; this only previews what the Coach / Travel Lead picked.
import { audienceCopy } from './audience-copy'
import type { PickerIssue, RepeatValue, Weekday } from './types'

const DAY = 86_400_000
export const MAX_INTERVAL_WEEKS = 8
export const MAX_SERIES_MEETINGS = 100
export const MAX_SERIES_DAYS = 366
export const PREVIEW_COUNT = 5
export const intervalOptions = Array.from({ length: MAX_INTERVAL_WEEKS }, (_, i) => i + 1)
export const weekdays: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6]

/** UTC midnight for a real YYYY-MM-DD date, or null (rejects 2026-02-30 and partial input). */
export function parseDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const ms = Date.UTC(year, month - 1, day)
  const check = new Date(ms)
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? ms : null
}

export function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function weekdayOf(date: string): Weekday | null {
  const ms = parseDay(date)
  return ms === null ? null : new Date(ms).getUTCDay() as Weekday
}

/** "Tue, Nov 3, 2026" for a YYYY-MM-DD date. */
export function previewDateLabel(date: string): string {
  const ms = parseDay(date)
  return ms === null ? date : new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(ms)
}

/** Starting point when a Coach turns repeating on: weekly on the first date's weekday, 10 meetings. */
/** "Tuesday", "Tuesday and Thursday", "Monday, Wednesday and Friday". */
export function listWords(words: readonly string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** One line for the review: how often and on which days, e.g. "Repeats every 2 weeks on Tuesday". */
export function repeatSummary(rule: Pick<RepeatValue, 'intervalWeeks' | 'weekdays'>): string {
  const days = [...new Set(rule.weekdays)].sort((a, b) => a - b).map(day => audienceCopy.weekdays.long[day])
  return audienceCopy.repeat.summary(rule.intervalWeeks, listWords(days))
}

export function defaultRepeat(startDate: string): RepeatValue {
  const day = weekdayOf(startDate)
  return { repeats: false, intervalWeeks: 1, weekdays: day === null ? [] : [day], ends: 'afterCount', endDate: '', count: 10 }
}

/**
 * Meeting dates on or after `startDate`, on the chosen weekdays of every Nth week (weeks start
 * Sunday, counted from the week holding `startDate`). Stops at the end rule or after `limit` dates.
 * A non-repeating event is just its first date.
 */
export function seriesDates(startDate: string, rule: RepeatValue, limit = MAX_SERIES_MEETINGS + 1): string[] {
  const start = parseDay(startDate)
  if (start === null) return []
  if (!rule.repeats) return [startDate]
  const interval = rule.intervalWeeks
  const days = [...new Set(rule.weekdays)].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b)
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL_WEEKS || !days.length) return []
  const end = rule.ends === 'onDate' ? parseDay(rule.endDate) : null
  if (rule.ends === 'onDate' && end === null) return []
  const count = rule.ends === 'afterCount' ? rule.count : Infinity
  if (rule.ends === 'afterCount' && (!Number.isInteger(count) || count < 1)) return []
  // Never look further than the longest allowed series, whatever the rule says.
  const lastAllowed = start + (MAX_SERIES_DAYS + MAX_INTERVAL_WEEKS * 7) * DAY
  const weekStart = start - new Date(start).getUTCDay() * DAY
  const out: string[] = []
  for (let week = 0; weekStart + week * 7 * DAY <= lastAllowed; week += interval) {
    for (const day of days) {
      const at = weekStart + (week * 7 + day) * DAY
      if (at < start) continue
      if (end !== null && at > end) return out
      out.push(formatDay(at))
      if (out.length >= count || out.length >= limit) return out
    }
  }
  return out
}

/** The first few dates plus the total, for the preview under the repeat picker. */
export function repeatPreview(startDate: string, rule: RepeatValue) {
  const dates = seriesDates(startDate, rule)
  const capped = dates.length > MAX_SERIES_MEETINGS
  return { next: dates.slice(0, PREVIEW_COUNT), total: capped ? MAX_SERIES_MEETINGS : dates.length, capped }
}

/** First thing to fix in a repeat rule, or null when it is ready (always null if it does not repeat). */
export function repeatIssue(startDate: string, rule: RepeatValue): PickerIssue | null {
  if (!rule.repeats) return null
  const copy = audienceCopy.repeat
  const start = parseDay(startDate)
  if (start === null) return { field: 'start', message: copy.needStart }
  if (!Number.isInteger(rule.intervalWeeks) || rule.intervalWeeks < 1 || rule.intervalWeeks > MAX_INTERVAL_WEEKS) return { field: 'interval', message: copy.needInterval }
  if (!rule.weekdays.length) return { field: 'days', message: copy.needDay }
  if (rule.ends === 'onDate') {
    const end = parseDay(rule.endDate)
    if (end === null) return { field: 'end-date', message: copy.needEndDate }
    if (end < start) return { field: 'end-date', message: copy.endBeforeStart }
    if (end - start > MAX_SERIES_DAYS * DAY) return { field: 'end-date', message: copy.endTooFar(MAX_SERIES_DAYS) }
  } else if (!Number.isInteger(rule.count) || rule.count < 1 || rule.count > MAX_SERIES_MEETINGS) {
    return { field: 'count', message: copy.needCount(MAX_SERIES_MEETINGS) }
  }
  const dates = seriesDates(startDate, rule)
  if (!dates.length) return { field: 'days', message: copy.previewEmpty }
  if (dates.length > MAX_SERIES_MEETINGS) return { field: rule.ends === 'onDate' ? 'end-date' : 'count', message: copy.tooMany(MAX_SERIES_MEETINGS) }
  return null
}
