import { describe, expect, it } from 'vitest'
import { defaultAudience, defaultMentorInvite } from './audience/audience-rules'
import type { AudienceValue, MentorInviteValue, MentorOption } from './audience/types'
import { audienceCreateArgs, capacityApplies, eventAudienceLabel, eventBadges, eventRequiredLabel, mentorMeetingCreateArgs, mentorMeetingEventArgs, seriesProgressNote, whoReviewText, whoSignupMode, type MentorMeetingDraft, type WhoChoice } from './event-audience-wiring'

const mentors: MentorOption[] = [{ id: 'm1', name: 'Mentor One', subteams: ['Programming'] }, { id: 'm2', name: 'Mentor Two', subteams: [] }]
const who = (audience: Partial<AudienceValue> = {}, invite: Partial<MentorInviteValue> = {}, travelTeam = false): WhoChoice =>
  ({ travelTeam, audience: { ...defaultAudience(), ...audience }, mentors: { ...defaultMentorInvite(), ...invite } })

describe('New event audience → createEvent arguments', () => {
  it.each([
    { name: 'Travel Team keeps the legacy assigned shape', choice: who({ kind: 'subteams', subteams: ['CAD'] }, { mentorIds: ['m2'], includeSubteamMentors: true }, true), args: { signupMode: 'assigned', assignmentScope: 'travelTeam', mentorInviteUserIds: ['m2'], locationType: 'inPerson' } },
    { name: 'Everyone, optional', choice: who(), args: { signupMode: 'open', audienceKind: 'everyone', mandatory: false, locationType: 'inPerson' } },
    { name: 'required subteams with their mentors', choice: who({ kind: 'subteams', subteams: ['CAD', 'Leadership'], required: true, studentIds: ['s1'] }, { includeSubteamMentors: true }), args: { signupMode: 'open', audienceKind: 'subteams', mandatory: true, audienceSubteams: ['CAD', 'Leadership'], inviteSubteamMentors: true, locationType: 'inPerson' } },
    { name: 'specific students drop subteams and subteam mentors', choice: who({ kind: 'students', studentIds: ['s1', 's2'], subteams: ['CAD'] }, { includeSubteamMentors: true }), args: { signupMode: 'open', audienceKind: 'students', mandatory: false, audienceStudentIds: ['s1', 's2'], locationType: 'inPerson' } },
    { name: 'mentors only is never required and drops unknown mentors', choice: who({ kind: 'mentors', required: true }, { mentorIds: ['m1', 'gone', 'm1'] }), args: { signupMode: 'open', audienceKind: 'mentorsOnly', mandatory: false, mentorInviteUserIds: ['m1'], locationType: 'inPerson' } },
  ])('$name', ({ choice, args }) => {
    expect(audienceCreateArgs(choice, mentors, 'inPerson')).toEqual(args)
  })

  it('passes the location type through', () => {
    expect(audienceCreateArgs(who(), mentors, 'virtual').locationType).toBe('virtual')
  })

  it.each([
    { name: 'Travel Team', choice: who({}, {}, true), mode: 'assigned', capacity: false },
    { name: 'optional Everyone', choice: who(), mode: 'open', capacity: true },
    { name: 'required students', choice: who({ kind: 'students', studentIds: ['s1'], required: true }), mode: 'assigned', capacity: false },
    { name: 'mentors only', choice: who({ kind: 'mentors' }), mode: 'assigned', capacity: false },
  ])('$name signs up as $mode (capacity: $capacity)', ({ choice, mode, capacity }) => {
    expect([whoSignupMode(choice), capacityApplies(choice)]).toEqual([mode, capacity])
  })

  it('reviews the choice in plain words', () => {
    expect(whoReviewText(who({ kind: 'subteams', subteams: ['Mechanical', 'CAD'], required: true }))).toBe('Subteams: Build, CAD · Required — signed up automatically')
    expect(whoReviewText(who({ kind: 'mentors' }))).toBe('Mentors only')
  })
})

describe('saved event audience wording', () => {
  it.each([
    { name: 'legacy open', event: { signupMode: 'open' as const }, audience: 'Open Registration', required: 'Optional — they choose to sign up' },
    { name: 'legacy Whole Team', event: { signupMode: 'assigned' as const, assignmentScope: 'wholeTeam' as const }, audience: 'Whole Team', required: 'Required — signed up automatically' },
    { name: 'legacy Travel Team', event: { signupMode: 'assigned' as const, assignmentScope: 'travelTeam' as const }, audience: 'Travel Team', required: 'Required — signed up automatically' },
    { name: 'optional subteams', event: { signupMode: 'open' as const, audienceKind: 'subteams' as const, audienceSubteams: ['CAD'], mandatory: false }, audience: 'Subteams: CAD', required: 'Optional — they choose to sign up' },
    { name: 'mentors only', event: { signupMode: 'assigned' as const, audienceKind: 'mentorsOnly' as const }, audience: 'Mentors only', required: 'Does not apply (mentors only)' },
  ])('$name', ({ event, audience, required }) => {
    expect([eventAudienceLabel(event), eventRequiredLabel(event)]).toEqual([audience, required])
  })
})

describe('eventBadges', () => {
  it.each([
    { name: 'optional everyone', event: { signupMode: 'open', audienceKind: 'everyone', mandatory: false }, badges: ['Everyone', 'Optional'] },
    { name: 'required subteams by name, virtual', event: { signupMode: 'open', audienceKind: 'subteams', audienceSubteams: ['Mechanical', 'CAD'], mandatory: true, locationType: 'virtual' }, badges: ['Build, CAD', 'Required', 'Virtual (Discord)'] },
    { name: 'mentors only has no Required badge', event: { signupMode: 'open', audienceKind: 'mentorsOnly' }, badges: ['Mentors only'] },
    { name: 'legacy Travel Team is required', event: { signupMode: 'assigned', assignmentScope: 'travelTeam' }, badges: ['Travel Team', 'Required'] },
    { name: 'no signup mode on a minimal row', event: { locationType: 'virtual' }, badges: ['Virtual (Discord)'] },
  ])('$name', ({ event, badges }) => {
    expect(eventBadges(event)).toEqual(badges)
  })
})

describe('seriesProgressNote', () => {
  it.each([
    { name: 'rolling window', series: { moreMeetingsScheduled: true, windowDays: 56, plannedMeetingCount: null }, note: 'More meetings are added automatically, 8 weeks ahead.' },
    { name: 'with a planned total', series: { moreMeetingsScheduled: true, windowDays: 56, plannedMeetingCount: 12 }, note: 'More meetings are added automatically, 8 weeks ahead. 12 meetings are planned in total.' },
    { name: 'all meetings created', series: { moreMeetingsScheduled: false, windowDays: 56, plannedMeetingCount: 4 }, note: '4 meetings are planned in total.' },
    { name: 'not part of a series', series: null, note: null },
  ])('$name', ({ series, note }) => {
    expect(seriesProgressNote(series)).toBe(note)
  })
})

describe('Mentor meeting → createMeeting / series arguments', () => {
  const draft = (overrides: Partial<MentorMeetingDraft> = {}): MentorMeetingDraft => ({ name: ' Build night ', startsAt: 1_000, endsAt: 2_000, where: 'shop', destination: 'ignored', audience: defaultAudience(), inviteSubteamMentors: false, mentorIds: [], ...overrides })

  it.each([
    { name: 'shop, Everyone', input: draft(), args: { name: 'Build night', startsAt: 1_000, endsAt: 2_000, destination: 'DSHS STEM Center (on site)', audienceKind: 'everyone', locationType: 'inPerson' } },
    { name: 'virtual, subteams with their Mentors', input: draft({ where: 'virtual', audience: { ...defaultAudience(), kind: 'subteams', subteams: ['CAD'] }, inviteSubteamMentors: true }), args: { name: 'Build night', startsAt: 1_000, endsAt: 2_000, destination: 'Virtual (Discord)', audienceKind: 'subteams', audienceSubteams: ['CAD'], inviteSubteamMentors: true, locationType: 'virtual' } },
    { name: 'elsewhere, students; subteam Mentors only apply to Subteams', input: draft({ where: 'elsewhere', destination: ' City park ', audience: { ...defaultAudience(), kind: 'students', studentIds: ['s1'], required: true }, inviteSubteamMentors: true }), args: { name: 'Build night', startsAt: 1_000, endsAt: 2_000, destination: 'City park', audienceKind: 'students', audienceStudentIds: ['s1'], locationType: 'inPerson' } },
    { name: 'Mentors only with picked Mentors', input: draft({ audience: { ...defaultAudience(), kind: 'mentors' }, mentorIds: ['m1', 'm1'] }), args: { name: 'Build night', startsAt: 1_000, endsAt: 2_000, destination: 'DSHS STEM Center (on site)', audienceKind: 'mentorsOnly', mentorInviteUserIds: ['m1'], locationType: 'inPerson' } },
  ])('$name', ({ input, args }) => {
    expect(mentorMeetingCreateArgs(input)).toEqual(args)
  })

  it('never sends a required meeting, fee, travel, form or Team Calendar entry for a repeating meeting', () => {
    const args = mentorMeetingEventArgs(draft({ audience: { ...defaultAudience(), required: true } }))
    expect(args).toMatchObject({ type: 'Team', mandatory: false, feeCents: 0, travel: 'None', overnight: false, roomingEnabled: false, permissionRequired: false, firstRequired: false, signupMode: 'open', allowWithdrawal: true, requirements: [], calendarChoice: { kind: 'none' } })
    expect(args).not.toHaveProperty('onsite')
  })
})
