const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric' })
const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })

/** "Sat, Nov 7" in Central Time. */
export const shiftDay = (startsAt: number) => day.format(startsAt)

/** "9:00 AM – 11:00 AM", with the end day added when a shift runs past midnight. */
export function shiftTimes(shift: { startsAt: number; endsAt: number }) {
  const end = shiftDay(shift.endsAt) === shiftDay(shift.startsAt) ? time.format(shift.endsAt) : `${shiftDay(shift.endsAt)}, ${time.format(shift.endsAt)}`
  return `${time.format(shift.startsAt)} – ${end}`
}
