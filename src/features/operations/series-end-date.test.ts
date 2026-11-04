import { describe, expect, it } from 'vitest'
import { canConfirm, continuesText, defaultEndDate, endDatePreviewNote, endDatePreviewText, repeatsText, type SeriesEndDetails, type SeriesEndPreview } from './series-end-date'

const base: SeriesEndDetails = { weekdays: [2], intervalWeeks: 1, startDate: '2026-09-01', endDate: null, minEndDate: '2026-11-04', maxEndDate: '2027-09-01', continuesFrom: null, seasonEndDate: null, onCalendar: false, blocker: null, windowDays: 56, status: 'active' }
const preview: SeriesEndPreview = { endDate: '2026-12-16', problem: null, lastMeetingDate: '2026-12-15', cancelCount: 0, cancelDates: [], addCount: 0, laterAddedAutomatically: false, shortening: false, unchanged: false }

describe('series end date', () => {
  it.each([
    [{ weekdays: [2], intervalWeeks: 1, endDate: '2027-05-31' }, 'Repeats every Tuesday until May 31, 2027'],
    [{ weekdays: [4, 2], intervalWeeks: 2, endDate: null }, 'Repeats every 2 weeks on Tuesday and Thursday'],
    [{ weekdays: [1, 3, 5], intervalWeeks: 1, endDate: '2026-12-01' }, 'Repeats every Monday, Wednesday and Friday until December 1, 2026'],
    // A whole series canceled (cancelFuture from its first meeting) no longer "repeats until" its old end.
    [{ weekdays: [2], intervalWeeks: 1, endDate: '2026-11-09', status: 'cancelled' }, 'This repeating meeting was canceled.'],
  ])('describes how the series repeats (%o)', (details, text) => {
    expect(repeatsText({ status: 'active', ...details })).toBe(text)
  })

  it.each([
    [{ endDate: '2027-01-12' }, '2027-01-12'],
    [{ seasonEndDate: '2027-05-31' }, '2027-05-31'],
    [{}, '2027-09-01'],
    [{ endDate: '2026-10-01' }, '2026-11-04'],
    [{ seasonEndDate: '2027-12-31' }, '2027-09-01'],
    // A series split by "this and following" can't run into the newer series.
    [{ seasonEndDate: '2027-05-31', maxEndDate: '2027-01-11', continuesFrom: '2027-01-12' }, '2027-01-11'],
  ])('starts the dialog at the current end, else the season end, within bounds (%o)', (change, expected) => {
    expect(defaultEndDate({ ...base, ...change })).toBe(expected)
  })

  it('says when a newer series continues this one', () => {
    expect(continuesText(base)).toBeNull()
    expect(continuesText({ continuesFrom: '2027-01-12' })).toBe('This series continues as a newer series from January 12, 2027.')
  })

  it.each([
    [{ problem: 'Choose today or a later date.', lastMeetingDate: null }, 'Choose today or a later date.', false],
    [{ unchanged: true }, 'No change', false],
    [{ shortening: true, cancelCount: 3, cancelDates: ['2026-12-22', '2026-12-29', '2027-01-05'] }, 'Last meeting: December 15, 2026 · 3 meetings will be canceled: Dec 22, Dec 29, Jan 5', true],
    [{ shortening: true, cancelCount: 5, cancelDates: ['2026-12-22', '2026-12-29', '2027-01-05'] }, 'Last meeting: December 15, 2026 · 5 meetings will be canceled: Dec 22, Dec 29, Jan 5 +2 more', true],
    [{ shortening: true, cancelCount: 1, cancelDates: ['2026-12-22'] }, 'Last meeting: December 15, 2026 · 1 meeting will be canceled: Dec 22', true],
    // Extending counts every new meeting up to the new end, not only those inside the 8-week window.
    [{ lastMeetingDate: '2027-01-12', addCount: 3, laterAddedAutomatically: true }, 'Last meeting: January 12, 2027 · 3 more meetings', true],
    [{ addCount: 1 }, 'Last meeting: December 15, 2026 · 1 more meeting', true],
    [{ addCount: 0 }, 'Last meeting: December 15, 2026 · no new meetings', true],
  ])('previews the change and whether it can be confirmed (%o)', (change, text, confirmable) => {
    const value = { ...preview, ...change }
    expect(endDatePreviewText(value)).toBe(text)
    expect(canConfirm(value)).toBe(confirmable)
  })

  it.each([
    [{ addCount: 3, laterAddedAutomatically: true }, 'They appear on the schedule as the date gets closer.'],
    [{ addCount: 1, laterAddedAutomatically: false }, null],
    [{ shortening: true, cancelCount: 2, laterAddedAutomatically: false }, null],
    [{ problem: 'Choose today or a later date.', laterAddedAutomatically: true }, null],
  ])('explains later meetings only when some are past the 8-week window (%o)', (change, note) => {
    expect(endDatePreviewNote({ ...preview, ...change })).toBe(note)
  })
})
