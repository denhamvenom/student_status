import { describe, expect, it } from 'vitest'
import { relativeTime, unreadBadge } from './format'

describe('unreadBadge', () => {
  it.each([[1, '1'], [98, '98'], [99, '99+'], [150, '99+']])('%i unread shows %s', (count, expected) => expect(unreadBadge(count)).toBe(expected))
})

describe('relativeTime', () => {
  const now = new Date(2026, 10, 1, 12, 0).getTime()
  const minute = 60_000, hour = 60 * minute, day = 24 * hour
  it.each([
    ['seconds ago', now - 20_000, 'Just now'],
    ['a clock a little ahead of this device', now + 30_000, 'Just now'],
    ['minutes ago', now - 5 * minute, '5 min ago'],
    ['hours ago', now - 3 * hour, '3 hr ago'],
    ['one day ago', now - day - hour, 'Yesterday'],
    ['several days ago', now - 4 * day, '4 days ago'],
    ['earlier this year', new Date(2026, 9, 3, 9, 0).getTime(), 'Oct 3'],
    ['a past year', new Date(2025, 9, 3, 9, 0).getTime(), 'Oct 3, 2025'],
  ])('%s', (_name, at, expected) => expect(relativeTime(at, now)).toBe(expected))
})
