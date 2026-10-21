import { describe, expect, it } from 'vitest'
import { rosterAsOfAtTransition } from './roster-refresh'

const minute = 60_000
const oldHourlyChanges = 60 // setInterval replaced asOf on every one-minute tick.

function argumentChanges(transitionAt: number | null, visibleAt: (minuteIndex: number) => boolean) {
  let asOf = 0
  let changes = 0
  for (let index = 1; index <= 60; index++) {
    const currentTransition = transitionAt !== null && transitionAt > asOf ? transitionAt : null
    const next = rosterAsOfAtTransition(asOf, currentTransition, index * minute, visibleAt(index))
    if (next !== asOf) changes++
    asOf = next
  }
  return { asOf, changes }
}

describe('roster time query arguments', () => {
  it('avoids the old 60 argument changes in an unchanged visible hour', () => {
    expect({ before: oldHourlyChanges, after: argumentChanges(null, () => true).changes }).toEqual({ before: 60, after: 0 })
  })

  it('refreshes once at the exact event transition', () => {
    const transitionAt = 29 * minute + 1
    expect(rosterAsOfAtTransition(0, transitionAt, 29 * minute, true)).toBe(0)
    expect(rosterAsOfAtTransition(0, transitionAt, transitionAt, true)).toBe(transitionAt)
    expect({ before: oldHourlyChanges, after: argumentChanges(transitionAt, () => true).changes }).toEqual({ before: 60, after: 1 })
  })

  it('suspends while hidden and catches up when visible', () => {
    const transitionAt = 29 * minute + 1
    const after = argumentChanges(transitionAt, index => index < 20 || index >= 40)
    expect({ before: oldHourlyChanges, after: after.changes }).toEqual({ before: 60, after: 1 })
    expect(after.asOf).toBe(40 * minute)
  })
})
