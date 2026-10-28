import { describe, expect, it } from 'vitest'
import type { WhatsLeftItem } from '../student-home/contract'
import type { ParentHomeSummary } from './contract'
import { groupWork, paidPercent, parentAllSet, parentItemHref, upcomingEvent } from './logic'

const item = (owner: WhatsLeftItem['owner'], kind: WhatsLeftItem['kind'] = 'requirement'): WhatsLeftItem => ({ key: `${owner}:${kind}`, owner, kind, eventId: null, eventName: null, label: null, dueAt: null, href: null })

describe('Parent Home decisions', () => {
  it.each([
    { owners: [] as WhatsLeftItem['owner'][], counts: [0, 0, 0], allSet: true },
    { owners: ['student', 'coach'] as WhatsLeftItem['owner'][], counts: [0, 1, 1], allSet: true },
    { owners: ['parent', 'student', 'parent'] as WhatsLeftItem['owner'][], counts: [2, 1, 0], allSet: false },
  ])('groups $owners for the right person', ({ owners, counts, allSet }) => {
    const work = owners.map(owner => item(owner))
    const groups = groupWork(work)
    expect([groups.parent.length, groups.student.length, groups.coach.length]).toEqual(counts)
    expect(parentAllSet(work)).toBe(allSet)
  })

  it.each([[0, 0, 0], [0, 500, 0], [10000, 2500, 25], [10000, 12000, 100], [10000, -100, 0]])('calculates a bounded paid ring for %i cents charged and %i paid', (charged, paid, percent) => {
    expect(paidPercent(charged, paid)).toBe(percent)
  })

  it('hides a past event while keeping a current event', () => {
    const summary = { nextEvent: { startsAt: 100 } } as ParentHomeSummary
    expect(upcomingEvent(summary, 101)).toBeNull()
    expect(upcomingEvent(summary, 100)).toBe(summary.nextEvent)
    expect(upcomingEvent({ ...summary, nextEvent: null }, 100)).toBeNull()
  })

  it.each([['healthProfile', '/setup?edit=1'], ['firstRegistration', '/setup?edit=1'], ['permissionForm', '/forms'], ['requiredPayment', '/finances'] ] as const)('routes %s to the parent action', (kind, href) => {
    expect(parentItemHref(item('parent', kind))).toBe(href)
  })
})
