type EventSchedule = {
  startsAt: number
  endsAt: number
  calendarAllDayStartDate?: string
  calendarAllDayEndDate?: string
}

const chicagoDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric',
})
const chicagoTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
})
const utcDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
})

export function eventSchedule(event: EventSchedule) {
  if (event.calendarAllDayStartDate && event.calendarAllDayEndDate) {
    const start = utcDate.format(new Date(`${event.calendarAllDayStartDate}T00:00:00Z`))
    // Calendar all-day end dates are exclusive.
    const end = utcDate.format(new Date(Date.parse(`${event.calendarAllDayEndDate}T00:00:00Z`) - 24 * 60 * 60 * 1000))
    return `${start === end ? start : `${start} – ${end}`} · All day`
  }
  const startDate = chicagoDate.format(event.startsAt)
  const endDate = chicagoDate.format(event.endsAt)
  const start = `${startDate}, ${chicagoTime.format(event.startsAt)}`
  const end = startDate === endDate ? chicagoTime.format(event.endsAt) : `${endDate}, ${chicagoTime.format(event.endsAt)}`
  return `${start} – ${end}`
}
