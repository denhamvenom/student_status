/** Team 8044's calendar: every date-only field and wall-clock rule means America/Chicago. */
export const TEAM_TIME_ZONE = 'America/Chicago'

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
const offsetFormatters = new Map<string, Intl.DateTimeFormat>()
const dateFormatter = new Intl.DateTimeFormat('en-US', { timeZone: TEAM_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** UTC offset in minutes (e.g. -300 for CDT) of `timeZone` at the instant `ms`. Throws RangeError for unknown zones or invalid times. */
export function zoneOffsetMinutes(ms: number, timeZone: string = TEAM_TIME_ZONE): number {
  let formatter = offsetFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
    offsetFormatters.set(timeZone, formatter)
  }
  const label = formatter.formatToParts(new Date(ms)).find(part => part.type === 'timeZoneName')?.value ?? ''
  if (label === 'GMT' || label === 'UTC') return 0
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(label)
  if (!match) throw new Error(`Time zone offset for ${timeZone} could not be resolved.`)
  return (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === '+' ? 1 : -1)
}

/**
 * The UTC instant of a local wall time ("HH:mm" or "HH:mm:ss") on a "YYYY-MM-DD" date in `timeZone`.
 * Ambiguous fall-back times resolve to the earlier (daylight) instant; skipped spring-forward times move forward by the gap
 * (2:30 AM becomes 3:30 AM CDT), matching Google Calendar. Malformed input throws RangeError.
 */
export function zonedWallTimeToUtc(date: string, time: string, timeZone: string = TEAM_TIME_ZONE): number {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute, second = 0] = time.split(':').map(Number)
  const wall = Date.UTC(year, month - 1, day, hour, minute, second)
  const before = zoneOffsetMinutes(wall - DAY_MS, timeZone)
  const after = zoneOffsetMinutes(wall + DAY_MS, timeZone)
  const valid = [...new Set([before, after])]
    .map(offset => wall - offset * MINUTE_MS)
    .filter(utc => zoneOffsetMinutes(utc, timeZone) * MINUTE_MS === wall - utc)
    .sort((a, b) => a - b)
  return valid[0] ?? wall - before * MINUTE_MS
}

/** "YYYY-MM-DD" of the Chicago calendar date containing the instant `ms`, independent of server/browser locale. Throws RangeError for an invalid time. */
export function chicagoDateString(ms: number): string {
  const parts = dateFormatter.formatToParts(new Date(ms))
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** The instant of local midnight starting the Chicago calendar date "YYYY-MM-DD". */
export function chicagoMidnight(date: string): number {
  return zonedWallTimeToUtc(date, '00:00')
}

/** The last millisecond of the Chicago calendar date "YYYY-MM-DD"; NaN when it is not a real date (including years below 1000). */
export function endOfChicagoDay(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return Number.NaN
  const lastMinute = zonedWallTimeToUtc(date, '23:59')
  return chicagoDateString(lastMinute) === date ? lastMinute + 59_999 : Number.NaN
}
