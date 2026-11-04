import { describe, expect, it } from 'vitest'
import { audienceIssue, changeAudienceKind, defaultAudience, filterStudents, invitedMentorIds, mentorCountText, mentorInviteIssue, needsPermissionForm, sectionApplies } from './audience-rules'
import type { AudienceKind, AudienceValue, MentorOption } from './types'

const audience = (change: Partial<AudienceValue> = {}): AudienceValue => ({ ...defaultAudience(), ...change })

describe('changeAudienceKind', () => {
  it.each([
    { to: 'mentors', canAutoAssign: true, required: false },
    { to: 'everyone', canAutoAssign: false, required: false },
    { to: 'subteams', canAutoAssign: false, required: false },
    { to: 'students', canAutoAssign: false, required: true },
    { to: 'subteams', canAutoAssign: true, required: true },
  ] as { to: AudienceKind; canAutoAssign: boolean; required: boolean }[])('a required event moved to $to (Coach: $canAutoAssign) stays required: $required', ({ to, canAutoAssign, required }) => {
    expect(changeAudienceKind(audience({ kind: 'students', studentIds: ['s1'], required: true }), to, canAutoAssign)).toMatchObject({ kind: to, required, studentIds: ['s1'] })
  })
})

describe('audienceIssue', () => {
  it.each([
    { name: 'Everyone', value: audience(), canAutoAssign: false, field: null },
    { name: 'Subteams with none picked', value: audience({ kind: 'subteams' }), canAutoAssign: true, field: 'subteams' },
    { name: 'Specific students with none picked', value: audience({ kind: 'students' }), canAutoAssign: true, field: 'students' },
    { name: 'a Travel Lead making Everyone required', value: audience({ required: true }), canAutoAssign: false, field: 'required' },
    { name: 'a Travel Lead making Subteams required', value: audience({ kind: 'subteams', subteams: ['CAD'], required: true }), canAutoAssign: false, field: 'required' },
    { name: 'a Travel Lead making specific students required', value: audience({ kind: 'students', studentIds: ['s1'], required: true }), canAutoAssign: false, field: null },
    { name: 'the Coach making Everyone required', value: audience({ required: true }), canAutoAssign: true, field: null },
  ])('$name → $field', ({ value, canAutoAssign, field }) => {
    expect(audienceIssue(value, canAutoAssign)?.field ?? null).toBe(field)
  })
})

describe('filterStudents', () => {
  const students = [{ id: 'a', name: 'Avery Example', subteam: 'Programming' }, { id: 'b', name: 'Blake Sample', subteam: 'Mechanical' }, { id: 'c', name: 'Casey Test', subteam: '' }]
  it.each([
    { search: '', ids: ['a', 'b', 'c'] },
    { search: '  avery ', ids: ['a'] },
    { search: 'build', ids: ['b'] },
    { search: 'unassigned', ids: ['c'] },
    { search: 'nobody', ids: [] },
  ])('“$search” → $ids', ({ search, ids }) => {
    expect(filterStudents(students, search).map(s => s.id)).toEqual(ids)
  })
})

describe('mentor invites', () => {
  const mentors: MentorOption[] = [{ id: 'm1', name: 'Mentor One', subteams: ['Programming'] }, { id: 'm2', name: 'Mentor Two', subteams: ['Mechanical', 'CAD'] }, { id: 'm3', name: 'Mentor Three', subteams: [] }]
  it.each([
    { name: 'picked mentors only', invite: { mentorIds: ['m3'], includeSubteamMentors: false }, value: audience({ kind: 'subteams', subteams: ['Build'] }), ids: ['m3'] },
    { name: 'plus mentors of the chosen subteams, counting legacy names once', invite: { mentorIds: ['m2'], includeSubteamMentors: true }, value: audience({ kind: 'subteams', subteams: ['Build', 'Programming'] }), ids: ['m2', 'm1'] },
    { name: 'subteam mentors only apply to a Subteams event', invite: { mentorIds: [], includeSubteamMentors: true }, value: audience({ subteams: ['Programming'] }), ids: [] },
    { name: 'mentors no longer listed are dropped', invite: { mentorIds: ['gone', 'm1'], includeSubteamMentors: false }, value: audience(), ids: ['m1'] },
  ])('$name', ({ invite, value, ids }) => {
    expect(invitedMentorIds(invite, mentors, value)).toEqual(ids)
  })

  it('needs at least one mentor only for a Mentors only event', () => {
    const none = { mentorIds: [], includeSubteamMentors: false }
    expect(mentorInviteIssue(none, mentors, audience({ kind: 'mentors' }))?.field).toBe('mentors')
    expect(mentorInviteIssue({ ...none, mentorIds: ['m1'] }, mentors, audience({ kind: 'mentors' }))).toBeNull()
    expect(mentorInviteIssue(none, mentors, audience())).toBeNull()
  })
})

describe('virtual events', () => {
  it('skip in-person sections and never ask for a permission form', () => {
    expect((['transport', 'rooming', 'overnight', 'travel'] as const).map(s => sectionApplies('virtual', s))).toEqual([false, false, false, false])
    expect(sectionApplies('inPerson', 'rooming')).toBe(true)
    expect([needsPermissionForm('virtual', true), needsPermissionForm('inPerson', true), needsPermissionForm('inPerson', false)]).toEqual([false, true, false])
  })
})

describe('mentorCountText', () => {
  const mentors: MentorOption[] = [{ id: 'm1', name: 'Pat', subteams: ['Programming'] }]
  const subteams = (list: string[]): AudienceValue => ({ ...defaultAudience(), kind: 'subteams', subteams: list })
  it.each([
    { name: 'names a subteam with no mentors', list: ['Build'], include: true, text: 'No mentors are assigned to Build yet.' },
    { name: 'counts mentors and names the gap', list: ['Programming', 'Build', 'CAD'], include: true, text: '1 mentor will be invited. No mentors are assigned to Build and CAD yet.' },
    { name: 'keeps the plain count when the option is off', list: ['Build'], include: false, text: 'No mentors will be invited.' },
  ])('$name', ({ list, include, text }) => {
    expect(mentorCountText({ mentorIds: [], includeSubteamMentors: include }, mentors, subteams(list))).toBe(text)
  })
})
