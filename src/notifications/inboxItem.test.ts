import { describe, expect, it } from 'vitest'
import { internalPath, opensInPlace } from './inboxItem'

describe('opensInPlace', () => {
  // Reproduces the tester report: tapping an announcement went to Home, where the message is not shown.
  it.each([
    ['team announcement (Home link)', { category: 'announcements', url: '/' }, true],
    ['join welcome links to setup', { category: 'announcements', url: '/setup' }, false],
    ['test notification (Home link)', { category: 'schedule', url: '/' }, true],
    ['off-site link, treated as Home', { category: 'events', url: 'https://example.com' }, true],
    ['event change', { category: 'schedule', url: '/events/abc' }, false],
    ['form to sign', { category: 'forms', url: '/forms' }, false],
  ])('%s', (_name, item, expected) => expect(opensInPlace(item)).toBe(expected))
})

describe('internalPath', () => {
  it.each([
    ['/events/1', '/events/1'], ['/setup', '/setup'], ['//evil.example', '/'], ['/\\evil.example', '/'], ['/\t/evil.example', '/'],
    ['https://evil.example', '/'], ['', '/'],
  ])('%j → %s', (url, expected) => expect(internalPath(url)).toBe(expected))
})
