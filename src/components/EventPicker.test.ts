import { describe, expect, it } from 'vitest'
import { defaultEventId, eventPickerLabel, filterEvents, splitEvents, type PickerEvent } from './EventPicker'

const hour = 3_600_000
// Noon Chicago time on the given 2026 date (November is CST, UTC-6).
const at = (month: number, day: number, hourOfDay = 12) => Date.UTC(2026, month - 1, day, hourOfDay + 6)
const event = (_id: string, name: string, startsAt: number): PickerEvent => ({ _id, name, startsAt, endsAt: startsAt + hour })
const events = [
  event('old', 'QA2 Tuesday Meeting', at(11, 3)),
  event('soon', 'QA2 Tuesday Meeting', at(11, 17)),
  event('mid', 'QA2 Tuesday Meeting', at(11, 10)),
  event('trip', 'Regional Competition', at(3, 12) + 365 * 24 * hour),
]
const now = at(11, 9)

describe('event picker', () => {
  it('puts upcoming events first, soonest first, and folds past events latest first', () => {
    const { upcoming, past } = splitEvents(events, now)
    expect(upcoming.map(e => e._id)).toEqual(['mid', 'soon', 'trip'])
    expect(past.map(e => e._id)).toEqual(['old'])
  })

  it('defaults to the next upcoming event, or the latest past one when none is upcoming', () => {
    expect(defaultEventId(events, now)).toBe('mid')
    expect(defaultEventId(events, at(12, 1))).toBe('trip')
    expect(defaultEventId(events, at(12, 1) + 2 * 365 * 24 * hour)).toBe('trip')
    expect(defaultEventId([], now)).toBeNull()
  })

  it('tells same-name events apart by date, adding the time only when two share a day', () => {
    expect(eventPickerLabel(events[1], events)).toBe('Tue, Nov 17, 2026')
    const twoADay = [event('a', 'Shift', at(11, 10, 9)), event('b', 'Shift', at(11, 10, 15))]
    expect(eventPickerLabel(twoADay[0], twoADay)).toBe('Tue, Nov 10, 2026 · 9:00 AM')
    expect(eventPickerLabel(twoADay[1], twoADay)).toBe('Tue, Nov 10, 2026 · 3:00 PM')
  })

  it('searches the name and the printed date', () => {
    expect(filterEvents(events, 'regional').map(e => e._id)).toEqual(['trip'])
    expect(filterEvents(events, 'tuesday nov 17').map(e => e._id)).toEqual(['soon'])
    expect(filterEvents(events, 'nothing here')).toEqual([])
    expect(filterEvents(events, '  ')).toHaveLength(4)
  })
})
