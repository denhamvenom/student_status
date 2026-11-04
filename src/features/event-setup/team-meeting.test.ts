import { describe, expect, it } from 'vitest'
import { parseChicagoInput } from '@/lib/chicago-time'
import type { Weekday } from './audience/types'
import { firstSearchDate, isPlan, seasonEndDate, teamMeetingDefaults, teamMeetingEventArgs, teamMeetingPlan } from './team-meeting'

// Tuesday, November 3, 2026 in Central Time.
const at = (time: string) => parseChicagoInput(`2026-11-03T${time}`)

describe('Team meeting first meeting and season end', () => {
  it.each([
    ['before the meeting time, today still counts', at('15:00'), '18:00', '2026-11-03'],
    ['once the meeting time has passed, start tomorrow', at('18:00'), '18:00', '2026-11-04'],
  ])('%s', (_, now, startTime, expected) => {
    expect(firstSearchDate(now, startTime)).toBe(expected)
  })

  it.each([
    ['2026-11-03', '2027-05-31'],
    ['2027-01-15', '2027-05-31'],
    ['2027-05-31', '2027-05-31'],
    ['2027-06-01', '2028-05-31'],
    ['2027-07-31', '2028-05-31'],
  ])('a series starting %s ends at season end %s', (date, expected) => {
    expect(seasonEndDate(date)).toBe(expected)
  })

  it.each([
    ['Tuesday before 6 PM meets tonight', at('09:00'), [2], '2026-11-03'],
    ['Tuesday after 6 PM waits a week', at('19:30'), [2], '2026-11-10'],
    ['Thursday picks the next Thursday', at('09:00'), [4], '2026-11-05'],
  ] as const)('%s', (_, now, weekdays, firstDate) => {
    const plan = teamMeetingPlan({ ...teamMeetingDefaults(true), weekdays: [...weekdays] }, now)
    expect(isPlan(plan) && { start: plan.start, end: plan.end, endDate: plan.repeat.endDate, ends: plan.repeat.ends }).toEqual({ start: `${firstDate}T18:00`, end: `${firstDate}T20:00`, endDate: '2027-05-31', ends: 'onDate' })
  })

  it.each([
    [{ name: ' ' }, 'name'],
    [{ weekdays: [] }, 'days'],
    [{ endTime: '17:00' }, 'ends'],
    // Five days a week until the end of May is more than the 100-meeting series limit.
    [{ weekdays: [1, 2, 3, 4, 5] }, 'count'],
  ] as const)('%o is refused on %s', (change, field) => {
    const plan = teamMeetingPlan({ ...teamMeetingDefaults(true), ...change, weekdays: [...('weekdays' in change ? change.weekdays : [2])] as Weekday[] }, at('09:00'))
    expect(isPlan(plan) ? null : plan.field).toBe(field)
  })
})

describe('Team meeting event arguments', () => {
  it.each([
    ['Coach', true, true, false],
    ['Travel Lead', false, false, true],
  ])('%s: at our shop, free, no forms, off Team Calendar; required only for a Coach', (_, isCoach, mandatory, allowWithdrawal) => {
    const args = teamMeetingEventArgs({ ...teamMeetingDefaults(isCoach), subteams: ['Programming'] }, isCoach, 1, 2)
    expect(args).toMatchObject({ type: 'Team', onsite: true, feeCents: 0, permissionRequired: false, firstRequired: false, calendarChoice: { kind: 'none' }, audienceKind: 'subteams', audienceSubteams: ['Programming'], mandatory, allowWithdrawal })
  })
})
