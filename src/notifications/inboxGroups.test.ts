import { describe, expect, it } from 'vitest'
import { groupInbox, tidyDates, type InboxRow } from './inboxGroups'

const NOW = Date.parse('2026-11-10T18:00:00Z')
const DAY = 86_400_000
const row = (id: string, over: Partial<InboxRow> = {}): InboxRow => ({ _id: id, title: 'New meeting: Build night', body: 'Tue, Dec 8 at 6:00 PM.', url: '/events/e1', category: 'mentorEvents', createdAt: NOW - DAY, readAt: null, eventEndsAt: NOW + DAY, ...over })

describe('tidyDates', () => {
  it.each([
    ['New meeting: Tue, Tue, Dec 8', 'New meeting: Tue, Dec 8'],
    ['Tuesday, Tue, Dec 8 at 6 PM', 'Tuesday, Dec 8 at 6 PM'],
    ['Tue, Dec 8 at 6 PM', 'Tue, Dec 8 at 6 PM'],
  ])('%s', (input, expected) => expect(tidyDates(input)).toBe(expected))
})

describe('groupInbox', () => {
  it('folds repeats of the same notice into one row, newest first, unread if any is unread', () => {
    const { recent } = groupInbox([row('a', { createdAt: NOW - 3 * DAY, readAt: NOW }), row('b', { createdAt: NOW - DAY, readAt: NOW }), row('c', { createdAt: NOW - 2 * DAY })], NOW)
    expect(recent).toHaveLength(1)
    expect(recent[0]).toMatchObject({ ids: ['b', 'c', 'a'], count: 3, unread: true })
    expect(recent[0].item._id).toBe('b')
  })

  it('keeps different meetings apart', () => {
    const { recent } = groupInbox([row('a'), row('b', { url: '/events/e2', title: 'New meeting: Other' })], NOW)
    expect(recent.map(entry => entry.item._id)).toEqual(['a', 'b'])
  })

  it('moves new-meeting notices for meetings that already happened under Older, and nothing else', () => {
    const past = row('past', { eventEndsAt: NOW - DAY })
    const canceled = row('cancel', { title: 'Canceled: Build night', url: '/events/e3', eventEndsAt: NOW - DAY })
    const announcement = row('news', { title: 'New meeting: Tue, Dec 8', url: '/', eventEndsAt: null })
    const { recent, older } = groupInbox([past, canceled, announcement], NOW)
    expect(older.map(entry => entry.item._id)).toEqual(['past'])
    expect(recent.map(entry => entry.item._id).sort()).toEqual(['cancel', 'news'])
  })
})
