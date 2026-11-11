import { describe, expect, it } from 'vitest'
import { announcementStepIssue } from './AnnouncementWizard'

describe('announcement wizard steps', () => {
  it.each([
    [0, '  ', '', 'Enter a message.'],
    [0, 'Meeting moved', '', ''],
    [1, '', '2026-11-01', 'Choose today or a later date, or leave it blank.'],
    [1, '', '2026-11-09', ''],
    [1, '', '', ''],
    [2, '', '', ''],
  ])('step %i body %j date %j -> %s', (step, body, date, expected) => {
    expect(announcementStepIssue(step, { body, date }, '2026-11-09')).toBe(expected)
  })

  it('lets an edit keep a Show until date that has already passed', () => {
    expect(announcementStepIssue(1, { body: 'Meeting moved', date: '2026-11-01' }, '2026-11-09', '2026-11-01')).toBe('')
    expect(announcementStepIssue(1, { body: 'Meeting moved', date: '2026-11-02' }, '2026-11-09', '2026-11-01')).toBe('Choose today or a later date, or leave it blank.')
  })
})
