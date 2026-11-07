import { describe, expect, it } from 'vitest'
import { parseChicagoInput } from '@/lib/chicago-time'
import type { Weekday } from './audience/types'
import { firstSearchDate, isPlan, seasonEndDate, teamMeetingCopy, teamMeetingDefaults, teamMeetingEndDateLimits, teamMeetingEventArgs, teamMeetingPlan, teamMeetingPrefill, teamMeetingRepeatOn, teamMeetingSummary, type TeamMeetingDraft } from './team-meeting'

// Tuesday, November 3, 2026 in Central Time.
const at = (time: string) => parseChicagoInput(`2026-11-03T${time}`)
/** "Repeat this meeting" turned on, every Tuesday until season end. */
const weekly = (): TeamMeetingDraft => ({ ...teamMeetingDefaults(), repeats: true, weekdays: [2] })

describe('Team meeting is one time by default (owner decision, Nov 7 2026)', () => {
  it('starts as one meeting, 6–8 PM, on the first day still ahead', () => {
    expect(teamMeetingDefaults(at('09:00'))).toMatchObject({ repeats: false, date: '2026-11-03', startTime: '18:00', endTime: '20:00' })
    expect(teamMeetingDefaults(at('19:00')).date).toBe('2026-11-04')
    const plan = teamMeetingPlan(teamMeetingDefaults(at('09:00')), at('09:00'))
    expect(isPlan(plan) && { start: plan.start, end: plan.end, repeats: plan.repeat.repeats }).toEqual({ start: '2026-11-03T18:00', end: '2026-11-03T20:00', repeats: false })
    expect(isPlan(plan) && teamMeetingSummary(plan)).toBe('1 meeting · Nov 3')
  })

  it('meets on the chosen date', () => {
    const plan = teamMeetingPlan({ ...teamMeetingDefaults(), date: '2026-11-19' }, at('09:00'))
    expect(isPlan(plan) && plan.start).toBe('2026-11-19T18:00')
  })

  it.each([
    ['a date that already passed', { date: '2026-11-02' }, 'date'],
    ['today after the start time', { date: '2026-11-03' }, 'date'],
    ['a date that is not real', { date: '2026-02-30' }, 'date'],
  ] as const)('refuses %s', (_, change, field) => {
    const plan = teamMeetingPlan({ ...teamMeetingDefaults(), ...change }, at('19:00'))
    expect(isPlan(plan) ? null : plan.field).toBe(field)
  })

  it('"Repeat this meeting" starts weekly on the meeting’s own weekday and keeps days already chosen', () => {
    expect(teamMeetingRepeatOn({ ...teamMeetingDefaults(), date: '2026-11-05' }, at('09:00'))).toEqual({ repeats: true, weekdays: [4] })
    expect(teamMeetingRepeatOn({ ...teamMeetingDefaults(), weekdays: [1, 3] }, at('09:00'))).toEqual({ repeats: true, weekdays: [1, 3] })
  })

  it('"More options" hands the wizard a one-time meeting unless repeating is on', () => {
    expect(teamMeetingPrefill(teamMeetingDefaults(), true, at('09:00'))).toMatchObject({ start: '2026-11-03T18:00', repeat: { repeats: false } })
    expect(teamMeetingPrefill(weekly(), true, at('09:00')).repeat).toMatchObject({ repeats: true, weekdays: [2] })
  })
})

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
    const plan = teamMeetingPlan({ ...weekly(), weekdays: [...weekdays] }, now)
    expect(isPlan(plan) && { start: plan.start, end: plan.end, endDate: plan.repeat.endDate, ends: plan.repeat.ends }).toEqual({ start: `${firstDate}T18:00`, end: `${firstDate}T20:00`, endDate: '2027-05-31', ends: 'onDate' })
  })

  it.each([
    [{ name: ' ' }, 'name'],
    [{ weekdays: [] }, 'days'],
    [{ endTime: '17:00' }, 'ends'],
    // Five days a week until the end of May is more than the 100-meeting series limit.
    [{ weekdays: [1, 2, 3, 4, 5] }, 'repeat-ends'],
    [{ weekdays: [1, 2, 3, 4, 5], ends: 'afterCount', count: 101 }, 'count'],
  ] as const)('%o is refused on %s', (change, field) => {
    const plan = teamMeetingPlan({ ...weekly(), ...change, weekdays: [...('weekdays' in change ? change.weekdays : [2])] as Weekday[] }, at('09:00'))
    expect(isPlan(plan) ? null : plan.field).toBe(field)
  })
})

describe('Team meeting ending on a chosen date', () => {
  // First meeting: Tuesday, November 3, 2026 (before 6 PM).
  const onDate = (endDate: string) => ({ ...weekly(), ends: 'onDate' as const, endDate })

  it('defaults to season end, not a chosen date', () => {
    expect(weekly().ends).toBe('seasonEnd')
  })

  it('maps the chosen date to an onDate repeat ending that day', () => {
    const plan = teamMeetingPlan(onDate('2026-12-15'), at('09:00'))
    expect(isPlan(plan) && plan.repeat).toMatchObject({ repeats: true, intervalWeeks: 1, weekdays: [2], ends: 'onDate', endDate: '2026-12-15' })
  })

  it.each([
    ['the first meeting day itself', '2026-11-03'],
    ['exactly 366 days after the first meeting', '2027-11-04'],
  ])('allows %s', (_, endDate) => {
    expect(isPlan(teamMeetingPlan(onDate(endDate), at('09:00')))).toBe(true)
  })

  it('limits the date input from the first meeting through 366 days later', () => {
    expect(teamMeetingEndDateLimits('2026-11-03')).toEqual({ min: '2026-11-03', max: '2027-11-04' })
  })

  it.each([
    ['empty', '', teamMeetingCopy.needEndDate],
    ['not a real date', '2027-02-30', teamMeetingCopy.needEndDate],
    ['before the first meeting', '2026-11-02', teamMeetingCopy.endBeforeFirst('Tue, Nov 3, 2026')],
    ['more than 366 days out', '2027-11-05', teamMeetingCopy.endTooFar('Thu, Nov 4, 2027')],
  ])('refuses a date that is %s, on the date field', (_, endDate, message) => {
    expect(teamMeetingPlan(onDate(endDate), at('09:00'))).toEqual({ field: 'end-date', message })
  })

  it('refuses a chosen date that adds more than 100 meetings, on the date field', () => {
    const plan = teamMeetingPlan({ ...onDate('2027-11-04'), weekdays: [1, 2, 3] }, at('09:00'))
    expect(isPlan(plan) ? null : plan.field).toBe('end-date')
  })

  it('"More options" carries the chosen end date into the wizard', () => {
    expect(teamMeetingPrefill(onDate('2027-03-02'), true, at('09:00')).repeat).toMatchObject({ ends: 'onDate', endDate: '2027-03-02', weekdays: [2] })
  })

  it('"More options" still carries an unfinished chosen date, for the wizard to flag', () => {
    expect(teamMeetingPrefill({ ...onDate('2026-10-01'), name: '' }, true, at('09:00'))).toMatchObject({ start: '2026-11-03T18:00', repeat: { ends: 'onDate', endDate: '2026-10-01' } })
  })

  it('"More options" ends a repeating meeting at season end by default', () => {
    expect(teamMeetingPrefill(weekly(), true, at('09:00')).repeat).toMatchObject({ ends: 'onDate', endDate: '2027-05-31' })
  })
})

describe('Team meeting count before Create', () => {
  it.each([
    ['a chosen end once tonight is past the meeting time', { ends: 'onDate', endDate: '2026-12-22' }, at('19:30'), '7 meetings · Nov 10 – Dec 22'],
    ['season end, spanning the new year', {}, at('09:00'), '30 meetings · Nov 3, 2026 – May 25, 2027'],
    ['two days a week for three meetings', { weekdays: [2, 4], ends: 'afterCount', count: 3 }, at('09:00'), '3 meetings · Nov 3 – Nov 10'],
    ['a single meeting', { ends: 'afterCount', count: 1 }, at('09:00'), '1 meeting · Nov 3'],
  ] as const)('counts %s', (_, change, now, text) => {
    const plan = teamMeetingPlan({ ...weekly(), ...change, weekdays: [...('weekdays' in change ? change.weekdays : [2])] as Weekday[] }, now)
    expect(isPlan(plan) && teamMeetingSummary(plan)).toBe(text)
  })
})

describe('Team meeting event arguments', () => {
  it.each([
    ['Coach, left at the default (optional)', true, false, false, true],
    ['Coach choosing Required', true, true, true, false],
    ['Travel Lead (never required)', false, true, false, true],
  ])('%s: at our shop, free, no forms, on Team Calendar', (_, isCoach, required, mandatory, allowWithdrawal) => {
    const args = teamMeetingEventArgs({ ...teamMeetingDefaults(), subteams: ['Programming'], ...(required ? { required } : {}) }, isCoach, 1, 2)
    expect(args).toMatchObject({ type: 'Team', onsite: true, feeCents: 0, permissionRequired: false, firstRequired: false, calendarChoice: { kind: 'create' }, audienceKind: 'subteams', audienceSubteams: ['Programming'], mandatory, allowWithdrawal })
  })

  // Tue Nov 3, 2026 and Wed Nov 4, 2026, before the 2027 kickoff: Tuesday is the Required day (owner decision, Nov 7 2026).
  const tuesday = parseChicagoInput('2026-11-03T18:00'), wednesday = parseChicagoInput('2026-11-04T18:00')
  it.each([
    ['Wednesday, left at the default', false, null, wednesday, 'create'],
    ['Tuesday, left at the default', false, null, tuesday, 'none'],
    ['Tuesday, added by hand', false, true, tuesday, 'create'],
    ['Wednesday, left off by hand', false, false, wednesday, 'none'],
    ['repeating, even when added by hand', true, true, wednesday, 'none'],
  ] as const)('%s: Team Calendar %s', (_, repeats, addToCalendar, startsAt, kind) => {
    expect(teamMeetingEventArgs({ ...teamMeetingDefaults(), repeats, addToCalendar }, true, startsAt, startsAt + 7_200_000, 2027).calendarChoice).toEqual({ kind })
  })

  it('hands a hand-made Team Calendar choice to the full wizard, and nothing when left at the default', () => {
    expect(teamMeetingPrefill({ ...teamMeetingDefaults(), addToCalendar: true }, true, at('09:00')).addToCalendar).toBe(true)
    expect(teamMeetingPrefill(teamMeetingDefaults(), true, at('09:00'))).not.toHaveProperty('addToCalendar')
  })
})
