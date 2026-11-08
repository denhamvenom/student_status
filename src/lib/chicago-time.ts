import { zonedWallTimeToUtc } from '../../shared/chicago-time'

const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})

export function chicagoInputTime(epoch: number) {
  const values = parts.formatToParts(new Date(epoch))
  const get = (type: string) => values.find(part => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

export function parseChicagoInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return NaN
  const candidate = zonedWallTimeToUtc(value.slice(0, 10), value.slice(11))
  // A time the clocks skip is shifted forward by the shared rule; this entry point rejects it, as do impossible dates.
  return chicagoInputTime(candidate)===value ? candidate : NaN
}

export function chicagoDisplayTime(epoch: number) {
  return new Date(epoch).toLocaleString('en-US',{timeZone:'America/Chicago',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})
}
