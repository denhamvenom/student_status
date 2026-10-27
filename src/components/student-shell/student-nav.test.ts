import { describe, expect, test } from 'vitest'
import { initials, studentNavPath } from './student-nav'

describe('studentNavPath', () => {
  test.each([
    ['/', '/'],
    ['/events', '/events'],
    ['/events/abc123', '/events'],
    ['/events/abc123/rooming', '/events'],
    ['/finances', '/finances'],
    ['/parents/', '/parents'],
    ['/settings', '/settings'],
    ['/setup', null],
    ['/forms', null],
    ['/eventsarchive', null],
  ])('%s highlights %s', (pathname, expected) => {
    expect(studentNavPath(pathname)).toBe(expected)
  })
})

describe('initials', () => {
  test.each([
    ['Dev Student', 'DS'],
    ['  dev   student  ', 'DS'],
    ['Jordan Avery Example', 'JE'],
    ['Cher', 'C'],
    ['Dev "DJ" Student', 'DS'],
    ['(Jordan) W.', 'JW'],
    ['Élodie Ñúñez', 'ÉÑ'],
    ['', ''],
    [null, ''],
    [undefined, ''],
  ])('%j becomes %j', (name, expected) => {
    expect(initials(name)).toBe(expected)
  })
})
