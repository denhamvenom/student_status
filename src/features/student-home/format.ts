/** Every Student Home date is shown in the team's time zone, whatever the device says. */
export const TEAM_TIME_ZONE = 'America/Chicago'

const formatter = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: TEAM_TIME_ZONE, ...options })
const longDate = formatter({ weekday: 'long', month: 'short', day: 'numeric' })
const shortDate = formatter({ weekday: 'short', month: 'short', day: 'numeric' })
const monthDay = formatter({ month: 'short', day: 'numeric' })
const weekday = formatter({ weekday: 'short' })
const dateKey = formatter({ year: 'numeric', month: '2-digit', day: '2-digit' })
const dateParts = formatter({ month: 'short', day: 'numeric', year: 'numeric' })

/** "Monday, Oct 26" */
export const formatLongDate = (epoch: number) => longDate.format(epoch)
/** "Mon, Nov 9" */
export const formatShortDate = (epoch: number) => shortDate.format(epoch)
/** "Nov 6" */
export const formatMonthDay = (epoch: number) => monthDay.format(epoch)
/** "Fri" */
export const formatWeekday = (epoch: number) => weekday.format(epoch)

/** "YYYY-MM-DD" in Chicago; the calendar day the Student is living in. */
export function chicagoDateKey(epoch: number) {
  const parts = dateKey.formatToParts(epoch)
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** "Nov 21–23", "Nov 30 – Dec 2", or "Nov 21" for a one-day event. */
export function formatDateRange(startsAt: number, endsAt: number) {
  const start = dateParts.formatToParts(startsAt)
  const end = dateParts.formatToParts(Math.max(startsAt, endsAt))
  const get = (parts: Intl.DateTimeFormatPart[], type: string) => parts.find(item => item.type === type)?.value ?? ''
  const [startMonth, startDay, startYear] = [get(start, 'month'), get(start, 'day'), get(start, 'year')]
  const [endMonth, endDay, endYear] = [get(end, 'month'), get(end, 'day'), get(end, 'year')]
  if (startMonth === endMonth && startDay === endDay && startYear === endYear) return `${startMonth} ${startDay}`
  if (startMonth === endMonth && startYear === endYear) return `${startMonth} ${startDay}–${endDay}`
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}`
}

/** "$85", "$12.50", "$1,200" */
export function formatMoney(cents: number) {
  const whole = cents % 100 === 0
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })
}

/** "247", "2.5" — whole hours from 10 up, one decimal below. */
export function formatHours(minutes: number) {
  const hours = Math.max(0, minutes) / 60
  return hours >= 10 ? String(Math.floor(hours)) : String(Math.floor(hours * 10) / 10)
}

/** Two initials for an avatar: "Coach Rivera" → "CR", "Jordan W." → "JW". */
export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word))
  return words.slice(0, 2).map(word => Array.from(word.replace(/[^\p{L}\p{N}]/gu, ''))[0] ?? '').join('').toUpperCase()
}
