import { describe, expect, it } from 'vitest'
import { canceledCount, eventDateBucket, eventListCopy, eventListItems, eventListSections, seriesPattern, typeFilterOptions } from './event-list'

const hour = 3600_000, day = 24 * hour
const tue = Date.UTC(2026, 10, 3, 23, 0) // Tuesday 5:00 PM Central
const row = (id: string, startsAt: number, extra: { cancelled?: boolean; seriesId?: string; seriesDetached?: boolean } = {}) => ({ event: { _id: id, startsAt, endsAt: startsAt + 2 * hour, ...extra } })
const label = (item: ReturnType<typeof eventListItems>[number]) => item.kind === 'series' ? `${item.key}>${item.next.event._id}` : item.key

describe('eventListItems', () => {
  const rows = [
    row('late', tue + 20 * day),
    row('m1', tue, { seriesId: 's' }), row('m2', tue + 7 * day, { seriesId: 's' }), row('m3', tue + 14 * day, { seriesId: 's', cancelled: true }),
    row('early', tue + day), row('gone', tue + 2 * day, { cancelled: true }),
    row('lone', tue + 3 * day, { seriesId: 'single' }),
  ]
  it('sorts by date, hides canceled, and folds a series into one row at its next meeting', () => {
    const items = eventListItems(rows, { showCanceled: false, now: tue + 3 * hour })
    expect(items.map(label)).toEqual(['early', 'lone', 'series:s>m2', 'late'])
  })
  it('shows canceled events when asked, still inside their series', () => {
    const items = eventListItems(rows, { showCanceled: true, now: 0 })
    expect(items.map(item => item.key)).toEqual(['series:s', 'early', 'gone', 'lone', 'late'])
    expect(items[0].kind === 'series' && items[0].rows.map(r => r.event._id)).toEqual(['m1', 'm2', 'm3'])
    expect(canceledCount(rows)).toBe(2)
  })
  it.each([
    [false, 'Show all 3 meetings (1 canceled hidden)'],
    [true, 'Show all 3 meetings'],
  ])('keeps the series meeting count steady (Show canceled %s)', (showCanceled, summary) => {
    const series = eventListItems(rows, { showCanceled, now: 0 }).find(item => item.kind === 'series')
    expect(series?.kind === 'series' && eventListCopy.allMeetings(series.total, series.hiddenCanceled)).toBe(summary)
  })
  it.each([
    ['every meeting over', [row('p1', tue, { seriesId: 'x' }), row('p2', tue + 7 * day, { seriesId: 'x' })], tue + 8 * day],
    ['the only meeting ahead canceled', [row('p1', tue, { seriesId: 'x' }), row('c2', tue + 7 * day, { seriesId: 'x', cancelled: true })], tue + 3 * hour],
  ])('never labels a canceled or past meeting "next" (%s): the meetings are listed on their own', (_case, series, now) => {
    const items = eventListItems(series, { showCanceled: true, now })
    expect(items.map(item => item.kind)).toEqual(['single', 'single'])
    expect(items.map(item => item.key)).toEqual(series.map(r => r.event._id))
  })
  it('shows a fully canceled series as one "All meetings canceled" card, only with Show canceled on', () => {
    const series = [row('c1', tue, { seriesId: 'x', cancelled: true }), row('c2', tue + 7 * day, { seriesId: 'x', cancelled: true })]
    const shown = eventListItems(series, { showCanceled: true, now: tue + 3 * hour })
    expect(shown.map(item => item.kind)).toEqual(['canceledSeries'])
    expect(shown[0].kind === 'canceledSeries' && [shown[0].anchor.event._id, shown[0].rows.length]).toEqual(['c2', 2])
    expect(eventListItems(series, { showCanceled: false, now: 0 })).toEqual([])
  })
})

describe('eventDateBucket', () => {
  const sunNoon = Date.UTC(2026, 10, 8, 18, 0) // Sunday Nov 8, noon Central
  const satBeforeDst = Date.UTC(2026, 9, 31, 17, 0) // Saturday Oct 31, noon CDT; clocks fall back Nov 1
  it.each([
    ['later today', tue, Date.UTC(2026, 10, 4, 1, 0), 2 * hour, 'thisWeek'],
    ['Sunday night is still this week', tue, Date.UTC(2026, 10, 9, 5, 0), 2 * hour, 'thisWeek'],
    ['Monday after midnight is coming up', tue, Date.UTC(2026, 10, 9, 6, 30), 2 * hour, 'comingUp'],
    ['a multi-day event under way since last week', tue, Date.UTC(2026, 9, 31, 15, 0), 5 * day, 'thisWeek'],
    ['the fourth Sunday after this week', tue, Date.UTC(2026, 11, 7, 2, 0), 2 * hour, 'comingUp'],
    ['the Monday after that', tue, Date.UTC(2026, 11, 7, 15, 0), 2 * hour, 'later'],
    ['on Sunday, Monday is next week', sunNoon, Date.UTC(2026, 10, 9, 15, 0), 2 * hour, 'comingUp'],
    ['across the DST change, Sunday 11 PM CST', satBeforeDst, Date.UTC(2026, 10, 2, 5, 0), 2 * hour, 'thisWeek'],
    ['across the DST change, Monday 1 AM CST', satBeforeDst, Date.UTC(2026, 10, 2, 7, 0), 2 * hour, 'comingUp'],
    ['an event that is over', tue, tue - day, hour, 'past'],
  ])('%s', (_case, now, startsAt, length, bucket) => {
    expect(eventDateBucket({ startsAt, endsAt: startsAt + length }, now)).toBe(bucket)
  })
})

describe('eventListSections', () => {
  it('groups items into date sections in order, skips empty ones, and lists past events most recent first', () => {
    const items = eventListItems([
      row('old', tue - 9 * day), row('recent', tue - 2 * day), row('soon', tue + day),
      row('m1', tue + 14 * day, { seriesId: 's' }), row('m2', tue + 21 * day, { seriesId: 's' }), row('far', tue + 60 * day),
    ], { showCanceled: false, now: tue })
    expect(eventListSections(items, tue).map(section => [section.bucket, section.items.map(label)])).toEqual([
      ['thisWeek', ['soon']], ['comingUp', ['series:s>m1']], ['later', ['far']], ['past', ['recent', 'old']],
    ])
  })
})

describe('typeFilterOptions', () => {
  it('offers All, then the listed types in chip order with their chip names', () => {
    expect(typeFilterOptions(['Competition', 'Outreach', 'Team', 'Fundraiser'], type => type).map(option => option.label)).toEqual(['All', 'Competitions', 'Meetings', 'Outreach', 'Fundraisers'])
    expect(typeFilterOptions(['Outreach', 'Other'], type => `${type}!`)).toEqual([{ value: null, label: 'All' }, { value: 'Outreach', label: 'Outreach' }, { value: 'Other', label: 'Other!' }])
  })
})

describe('seriesPattern', () => {
  it('names the Central Time weekdays in week order', () => {
    expect(seriesPattern([row('a', tue + 2 * day), row('b', tue)])).toBe('Every Tuesday and Thursday')
    expect(seriesPattern([row('a', tue)])).toBe('Every Tuesday')
  })
  it('ignores a meeting moved to another day "this meeting only"', () => {
    const moved = row('b', tue + 8 * day, { seriesId: 's', seriesDetached: true }) // that week's meeting moved to Wednesday
    expect(seriesPattern([row('a', tue, { seriesId: 's' }), moved, row('c', tue + 14 * day, { seriesId: 's' })])).toBe('Every Tuesday')
    expect(seriesPattern([moved])).toBe('Every Wednesday')
  })
})
