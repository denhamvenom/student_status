import { describe, expect, it } from 'vitest'
import { visibleSelection, countRequirements, matchesRequirement, needsAttention, requirementChips, reminderText, rosterExportCsv, type RequirementRow } from './roster-requirements'

const base: RequirementRow = {
  studentId: 'a', name: 'Ada Example', active: true, firstRegistrationState: 'verified',
  balance: { state: 'ready', dueCents: 0 }, nextEvent: { name: 'Regional', state: 'ready', open: [], participation: 'confirmed' as const },
  missingSummary: [], permission: { state: 'signed', eventName: 'Regional' },
}
const row = (id: string, name: string, patch: Partial<RequirementRow>): RequirementRow => ({ ...base, studentId: id, name, ...patch })

const rows = [
  row('1', 'Ada Example', {}),
  row('2', 'Ben Example', { firstRegistrationState: 'needsCompletion', permission: { state: 'notSigned', eventName: 'Regional' } }),
  row('3', 'Cy Example', { balance: { state: 'ready', dueCents: 12_500 }, missingSummary: ['Profile setup', 'Room category'] }),
  row('4', 'Di Example', { nextEvent: { name: 'Regional', state: 'open', open: ['Required payment'], participation: 'confirmed' as const }, firstRegistrationState: 'awaitingVerification' }),
  row('5', 'Eli Example', { nextEvent: { name: 'Regional', state: 'unknown', open: [], participation: 'confirmed' as const }, balance: { state: 'updating', dueCents: null }, missingSummary: ['Profile setup'] }),
  row('6', 'Fay Example', { active: false, firstRegistrationState: 'needsCompletion', balance: { state: 'ready', dueCents: 500 } }),
]

describe('roster requirements', () => {
  it('keeps only selected students that the filters still show', () => {
    const shown = rows.slice(0, 3)
    expect(visibleSelection(shown, new Set(['2', '3', '6'])).map(r => r.studentId)).toEqual(['2', '3'])
  })

  it('counts each requirement from the same rows the filter uses', () => {
    const counts = countRequirements(rows)
    expect(counts).toEqual({ attention: 1, first: 1, permission: 1, balance: 1, missing: 1 })
    for (const key of ['attention', 'first', 'permission', 'balance', 'missing'] as const) {
      expect(rows.filter(r => matchesRequirement(r, key))).toHaveLength(counts[key])
    }
    expect(rows.filter(r => matchesRequirement(r, 'all'))).toHaveLength(rows.length)
  })

  it.each([
    ['open item on the next event', { nextEvent: { name: 'E', state: 'open' as const, open: ['Room selection'], participation: 'confirmed' as const } }, true],
    ['permission form alone has its own chip', { permission: { state: 'notSigned' as const, eventName: 'E' } }, false],
    ['only pending for the event', { nextEvent: { name: 'E', state: 'open' as const, open: ['Signup not confirmed yet'], participation: 'pending' as const } }, false],
    ['open state with nothing left to do', { nextEvent: { name: 'E', state: 'open' as const, open: [], participation: 'confirmed' as const } }, false],
    ['signed and waiting for review is not a gap', { permission: { state: 'review' as const, eventName: 'E' } }, false],
    ['event not fully checked filters nothing in', { nextEvent: { name: 'E', state: 'unknown' as const, open: [], participation: 'confirmed' as const } }, false],
    ['balance alone', { balance: { state: 'ready', dueCents: 9000 } }, false],
    ['no event', { nextEvent: null }, false],
    ['archived student', { active: false, nextEvent: { name: 'E', state: 'open' as const, open: ['x'], participation: 'confirmed' as const } }, false],
  ])('Needs attention: %s', (_label, patch, expected) => {
    expect(needsAttention({ ...base, ...patch })).toBe(expected)
  })

  it('shows the permission chip only while signing is open, with the counts in the labels', () => {
    const counts = countRequirements(rows)
    expect(requirementChips(counts, 6, true).map(c => c.label)).toEqual([
      'All · 6', 'Needs attention · 1', 'FIRST registration · 1 missing', 'Permission form · 1 not signed', 'Balance due · 1', 'Missing profile information · 1',
    ])
    expect(requirementChips(counts, 6, false).some(c => c.key === 'permission')).toBe(false)
  })

  it('writes one group message naming the item and event, and leaves out students who do not have it', () => {
    const r = reminderText([rows[1], rows[0], rows[2]], 'permission', 'group')
    expect(r).toEqual({ text: 'Reminder: please sign the permission form for Regional for Ben Example.', included: 1, left: 2 })
    expect(reminderText(rows.slice(0, 4), 'first', 'group').text).toBe('Reminder: please finish FIRST registration, including Consent & Release, for Ben Example.')
  })

  it('keeps money out of the group message and puts it in the per-student lines', () => {
    const group = reminderText([rows[2]], 'balance', 'group').text
    expect(group).not.toContain('125')
    expect(reminderText([rows[2]], 'balance', 'perStudent').text).toBe('Cy Example: balance due $125.00.')
    expect(reminderText([rows[2]], 'missing', 'perStudent').text).toBe('Cy Example: please add Room type.')
  })

  it('groups an attention reminder by event and lists open items per student', () => {
    const two = [rows[3], row('7', 'Gus Example', { nextEvent: { name: 'Outreach day', state: 'open', open: ['Shifts'], participation: 'confirmed' as const } })]
    expect(reminderText(two, 'attention', 'group').text).toBe('Reminder: Regional still has items left in Venom Status for Di Example.\nReminder: Outreach day still has items left in Venom Status for Gus Example.')
    expect(reminderText(two, 'attention', 'perStudent').text).toBe('Di Example (Regional): Required payment.\nGus Example (Outreach day): Shifts.')
    expect(reminderText([rows[0]], 'attention', 'group')).toEqual({ text: '', included: 0, left: 1 })
  })

  it('matches only some students when only some have open items on a confirmed, upcoming event', () => {
    const all = Array.from({ length: 15 }, (_, i) => row(String(i), `Student ${i}`, i < 4 ? { nextEvent: { name: 'Regional', state: 'open', open: ['Shifts'], participation: 'confirmed' } } : { permission: { state: 'notSigned', eventName: 'Regional' } }))
    expect(countRequirements(all).attention).toBe(4)
    expect(all.filter(r => matchesRequirement(r, 'attention'))).toHaveLength(4)
  })

  it('exports the same grade label the roster shows', () => {
    const csv = rosterExportCsv([{ ...rows[0], grade: '11', subteam: 'Build', travelTeam: false }])
    expect(csv).toContain('"Junior"')
    expect(csv).not.toContain('"11"')
  })

  it('exports names and statuses with spreadsheet formulas neutralized', () => {
    const csv = rosterExportCsv([{ ...rows[2], name: '=SUM(A1)', subteam: '', grade: null, travelTeam: true }])
    const lines = csv.replace('﻿', '').trim().split('\r\n')
    expect(lines[0]).toContain('"Balance due ($)"')
    expect(lines[1]).toBe(`"'=SUM(A1)","Not provided","No subteam","Yes","Verified","Signed","125.00","Regional","","Room type"`)
  })
})
