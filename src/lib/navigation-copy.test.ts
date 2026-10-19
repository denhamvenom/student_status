import { describe, expect, it } from 'vitest'
import { menu, staysOnCurrentGroup } from './navigation-copy'

describe('staff navigation', () => {
  it('keeps the New event draft mounted when its Events group tab is selected', () => {
    const events = ['/events', '/readiness', '/permissions', '/drivers', '/withdrawals']
    expect(staysOnCurrentGroup('/events/new', events)).toBe(true)
    expect(staysOnCurrentGroup('/events/synthetic-event', events)).toBe(true)
    expect(staysOnCurrentGroup('/readiness', events)).toBe(true)
    expect(staysOnCurrentGroup('/finances', events)).toBe(false)
  })

  it('recognizes student record routes as part of Team', () => {
    expect(staysOnCurrentGroup('/team/synthetic-student', ['/', '/enroll', '/attendance', '/reports'])).toBe(true)
  })

  it('lists Join requests for Travel Leads and labels a Parent profile for the student', () => {
    expect(menu.travelLead).toContainEqual(['Join requests', '/enroll'])
    expect(menu.parent).toContainEqual(['Student profile', '/profile'])
    expect(menu.coach).toContainEqual(['Archived records', '/retention'])
  })
})
