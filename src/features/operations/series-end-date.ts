// "Change end date" for a repeating series: the repeat sentence, the dialog's default date and its preview line.
// Pure (no Convex or React); the backend (convex/eventSeries.ts setEndDate / endDateDetails) checks every rule again.
import { operationsText } from '@/lib/operations-copy'

const copy = operationsText.seriesEnd
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

export type SeriesEndDetails = {
  weekdays: number[]; intervalWeeks: number; startDate: string; endDate: string | null
  /** Latest allowed end: one year after the start, or the day before a newer series split off this one (`continuesFrom`). */
  minEndDate: string; maxEndDate: string; continuesFrom: string | null; seasonEndDate: string | null; onCalendar: boolean; blocker: string | null; windowDays: number
  /** eventSeries status: 'active', 'ended', 'cancelled', 'needsReview' or 'conflict'. */
  status: string
}
/**
 * `cancelCount`/`cancelDates` (the first three): meetings a shorter end cancels. `addCount`: meetings a later end adds up to
 * that date; `laterAddedAutomatically` when some fall after the 8-week window and are added as their dates get closer.
 */
export type SeriesEndPreview = { endDate: string; problem: string | null; lastMeetingDate: string | null; cancelCount: number; cancelDates: string[]; addCount: number; laterAddedAutomatically: boolean; shortening: boolean; unchanged: boolean }

/** "May 31, 2027" for a YYYY-MM-DD calendar date (no time zone shift). */
export function formatDateKey(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function dayList(weekdays: number[]): string {
  const names = [...new Set(weekdays)].sort((a, b) => a - b).map(day => DAY_NAMES[day]).filter(Boolean)
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** "Dec 29" for a YYYY-MM-DD calendar date. */
function shortDate(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** "Repeats every Tuesday until May 31, 2027", or that the whole series was canceled. */
export function repeatsText(details: Pick<SeriesEndDetails, 'weekdays' | 'intervalWeeks' | 'endDate' | 'status'>): string {
  if (details.status === 'cancelled') return copy.canceledSeries
  return copy.repeats(dayList(details.weekdays), details.intervalWeeks, details.endDate ? formatDateKey(details.endDate) : null)
}

/** "This series continues as a newer series from …", or null when nothing was split off it. */
export function continuesText(details: Pick<SeriesEndDetails, 'continuesFrom'>): string | null {
  return details.continuesFrom ? copy.continuesFrom(formatDateKey(details.continuesFrom)) : null
}

/** The dialog's starting date: the current end, else the season's end, else the latest allowed date; kept within bounds. */
export function defaultEndDate(details: SeriesEndDetails): string {
  const wanted = details.endDate ?? details.seasonEndDate ?? details.maxEndDate
  if (wanted < details.minEndDate) return details.minEndDate
  return wanted > details.maxEndDate ? details.maxEndDate : wanted
}

/** Whether the dialog may confirm this preview: a valid date that actually changes the end. */
export const canConfirm = (preview: SeriesEndPreview | null) => !!preview && !preview.problem && !preview.unchanged

/**
 * The line under the date: the problem, "No change", or the last meeting and how many meetings are canceled (with their
 * first dates) or added in total up to the new end.
 */
export function endDatePreviewText(preview: SeriesEndPreview): string {
  if (preview.problem) return preview.problem
  if (preview.unchanged) return copy.noChange
  if (!preview.lastMeetingDate) return copy.noMeetings
  const last = formatDateKey(preview.lastMeetingDate)
  return preview.shortening ? copy.lastMeeting(last, preview.cancelCount, preview.cancelDates.map(shortDate)) : copy.lastMeetingExtended(last, preview.addCount)
}

/** The muted note under an extension's preview when some added meetings are after the 8-week window, else null. */
export function endDatePreviewNote(preview: SeriesEndPreview): string | null {
  return !preview.problem && !preview.unchanged && !preview.shortening && preview.addCount > 0 && preview.laterAddedAutomatically ? copy.addedLater : null
}
