import { describe, expect, it } from 'vitest'
import { parseChicagoInput } from '@/lib/chicago-time'
import type { Id } from '../../../convex/_generated/dataModel'
import type { RepeatValue } from './audience/types'
import { futureEditArgs, seriesBlocker, seriesCreateArgs } from './series-support'

const start = '2026-11-03T18:00', end = '2026-11-03T20:30'
const event = {
  name: 'Build night', type: 'Team' as const, startsAt: parseChicagoInput(start), endsAt: parseChicagoInput(end), destination: 'On site', travel: 'On site', onsite: true,
  overnight: false, roomingEnabled: false, feeCents: 0, signupMode: 'open' as const, allowWithdrawal: true, permissionRequired: false, firstRequired: false,
  requirements: [], calendarChoice: { kind: 'create' as const }, audienceKind: 'subteams' as const, audienceSubteams: ['CAD'], mandatory: false, locationType: 'inPerson' as const,
}
const weekly: RepeatValue = { repeats: true, intervalWeeks: 2, weekdays: [2, 4], ends: 'afterCount', endDate: '2027-01-01', count: 6 }

describe('repeating New event → eventSeries.create', () => {
  it('keeps the first meeting’s Central time and length, and the chosen end', () => {
    expect(seriesCreateArgs(event, weekly, start)).toMatchObject({
      name: 'Build night', audienceKind: 'subteams', audienceSubteams: ['CAD'], onsite: true, addToCalendar: true,
      rule: { startDate: '2026-11-03', weekdays: [2, 4], intervalWeeks: 2, localStartTime: '18:00', durationMinutes: 150, count: 6 },
    })
    const byDate = seriesCreateArgs(event, { ...weekly, ends: 'onDate' }, start)
    expect([byDate.rule.untilDate, 'count' in byDate.rule]).toEqual(['2027-01-01', false])
  })

  it.each([
    { name: 'Travel Team (no audience)', draft: { travelTeam: true, hasExtras: false, linksCalendar: false }, blocked: true },
    { name: 'time slots or questions', draft: { travelTeam: false, hasExtras: true, linksCalendar: false }, blocked: true },
    { name: 'a linked single Calendar entry', draft: { travelTeam: false, hasExtras: false, linksCalendar: true }, blocked: true },
    { name: 'an audience event', draft: { travelTeam: false, hasExtras: false, linksCalendar: false }, blocked: false },
  ])('$name blocks repeating: $blocked', ({ draft, blocked }) => {
    expect(seriesBlocker(draft) !== null).toBe(blocked)
  })

  it('refuses a Travel Team event even if it reaches the mapping', () => {
    expect(() => seriesCreateArgs({ ...event, audienceKind: undefined, signupMode: 'assigned', assignmentScope: 'travelTeam', mentorInviteUserIds: [] as Id<'appUsers'>[] }, weekly, start)).toThrow(/can’t repeat/)
  })
})

describe('"This and all future meetings" edits', () => {
  const meeting = { startsAt: parseChicagoInput(start), endsAt: parseChicagoInput(end) }
  it.each([
    { name: 'a new start time keeps the end and changes the length', values: { startsAt: parseChicagoInput('2026-11-03T18:30') }, args: { localStartTime: '18:30', durationMinutes: 120 } },
    { name: 'a later end only changes the length', values: { endsAt: parseChicagoInput('2026-11-03T21:00') }, args: { durationMinutes: 180 } },
    { name: 'a new name and place', values: { name: 'Shop night', destination: 'Room 12' }, args: { name: 'Shop night', destination: 'Room 12' } },
  ])('$name', ({ values, args }) => {
    expect(futureEditArgs(meeting, values)).toEqual(args)
  })
  it.each([
    { name: 'moving to another day', values: { startsAt: parseChicagoInput('2026-11-04T18:00') } },
    { name: 'Media Support', values: { mediaSupportRequested: true } },
  ])('refuses $name', ({ values }) => {
    expect(() => futureEditArgs(meeting, values)).toThrow()
  })
})
