import { describe, expect, it } from 'vitest'
import { students } from '../../fixtures'
import * as rd from './reviewData'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('?review= sample data reconciles', () => {
  it.each(['A', 'D'])('Student %s per-fee balances add up to the headline Money numbers', id => {
    const lines = rd.feeLines[id]
    const m = rd.moneyFor(id)
    expect(sum(lines.map(l => l.charged - l.paid))).toBe(m.due)
    expect(m.charged - m.paid).toBe(m.due)
    expect(sum(lines.map(l => l.paid))).toBe(m.paid)
    // Fundraising credit never goes negative once fees are paid from it.
    expect(rd.availableFunds(id)).toBeGreaterThanOrEqual(0)
  })

  it('Coach and Travel Lead totals equal the sum of the student rows', () => {
    expect(rd.moneyRows).toHaveLength(students.length)
    expect(rd.teamMoney.charged).toBe(sum(rd.moneyRows.map(r => r.charged)))
    expect(rd.teamMoney.paid).toBe(sum(rd.moneyRows.map(r => r.paid)))
    expect(rd.teamMoney.due).toBe(rd.teamMoney.charged - rd.teamMoney.paid)
    expect(rd.teamMoney.due).toBe(sum(rd.moneyRows.map(r => r.due)))
  })

  it('a student with a balance due has an open payment requirement, and the reverse', () => {
    for (const s of rd.travelStudents) {
      const due = rd.moneyFor(s.id).due > 0
      const openPayment = rd.requirementEventIds.some(id => rd.isOpen(rd.requirements[s.id]?.[id]?.payment))
      expect(openPayment, s.name).toBe(due)
    }
  })

  it('Readiness counts match the visible rows and the Team page', () => {
    for (const id of rd.requirementEventIds) {
      const rows = rd.travelStudents.filter(s => rd.openCount(s.id, id) > 0)
      expect(rd.studentsOpenFor(id)).toBe(rows.length)
    }
    expect(rd.needsAttention.map(s => s.id).sort()).toEqual(
      students.filter(s => rd.requirementEventIds.some(id => rd.openCount(s.id, id) > 0)).map(s => s.id).sort(),
    )
    // Student B is Ready on Team, so nothing is open for them on any event.
    const b = students.find(s => s.id === 'B')!
    expect(rd.studentReady(b)).toBe(true)
    expect(rd.requirementEventIds.map(id => rd.openCount('B', id))).toEqual([0, 0])
  })

  it('past events are never open for signup, and Home starts with the soonest upcoming event', () => {
    expect(rd.pastEvents.map(e => e.id).sort()).toEqual(['E3', 'E4'])
    for (const e of rd.pastEvents) for (const s of ['A', 'D']) expect(rd.participationFor(s, e.id)).toBe('Past event')
    expect(rd.upcomingEvents.every(e => e.startsOn >= rd.REVIEW_TODAY)).toBe(true)
    expect(rd.upcomingEvents[0].name).toBe('Offseason Event 2')
  })

  it("every What's left action lands on an existing event or page", () => {
    for (const id of ['A', 'D']) for (const role of ['student', 'parent'] as const) {
      for (const t of rd.leftFor(id, role)) {
        const m = /^\/events\/([^/]+)\/(rooming|requirements)$/.exec(t.href)
        if (m) expect(rd.eventById(m[1]), t.href).toBeDefined()
        else expect(['/finances', '/first', '/forms'], t.href).toContain(t.href)
      }
    }
    expect(rd.leftFor('A', 'student').map(t => t.state)).toEqual(['open', 'open', 'open', 'open', 'pending'])
  })
})
