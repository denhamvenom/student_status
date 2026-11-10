import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { arrangeRows, availableFundsCents, CoachFinanceTable, type FinanceStudentRow } from './CoachFinanceTable'

const row: FinanceStudentRow = { studentId: 'fictional', name: 'Fictional member', state: 'ready', chargedCents: 10001, personalAppliedCents: 2500, fundraisingAppliedCents: 5000, dueCents: 2501, fundraisingAvailableCents: 731, updatedAt: null, canRecord: false }
const render = (rows: FinanceStudentRow[], loading = false) => renderToStaticMarkup(createElement(CoachFinanceTable, { rows, loading, loadingMore: false, hasMore: false, onMore: () => undefined, onOpen: () => undefined, onRecord: () => undefined }))
describe('Coach finance source columns', () => {
  it('does not claim an empty season at a native pagination split', () => {
    const html = renderToStaticMarkup(createElement(CoachFinanceTable, { rows: [], loading: false, loadingMore: false, hasMore: true, onMore: () => undefined, onOpen: () => undefined, onRecord: () => undefined }))
    expect(html).toContain('More student records are available')
    expect(html).not.toContain('No active student accounts')
  })
  it('renders source-separated applied values and fundraising availability with exact cents', () => {
    const html = render([row])
    for (const amount of ['$100.01', '$25.00', '$50.00', '$25.01', '$7.31']) expect(html).toContain(amount)
    expect(html).not.toContain('Record payment for')
    expect(html).toContain('Open account for Fictional member')
    expect(render([{ ...row, canRecord: true }])).toContain('Record payment for Fictional member')
  })
  it('withholds even old supplied values while a row is updating and never substitutes zero', () => {
    const html = render([{ ...row, state: 'updating', canRecord: true }])
    expect(html).toContain('Account totals are updating')
    expect(html).toContain('Unavailable')
    expect(html).not.toContain('$100.01')
    expect(html).not.toContain('$0.00')
    expect(html).not.toContain('Record payment for')
  })
  it('distinguishes initial loading from an empty season and refuses unsafe numeric formatting', () => {
    expect(render([], true)).toContain('Loading student accounts')
    expect(render([], true)).not.toContain('No active student accounts')
    expect(render([])).toContain('No active student accounts')
    expect(render([{ ...row, chargedCents: Number.MAX_SAFE_INTEGER + 1 }])).toContain('Unavailable')
  })
})

describe('Money table Available funds, sort and filter', () => {
  const due = (id: string, dueCents: number | null, state: FinanceStudentRow['state'] = 'ready') => ({ ...row, studentId: id, name: id, dueCents, state })
  it('adds unused payments and fundraising credit, the same total Reports shows', () => {
    expect(availableFundsCents({ personalAvailableCents: 100, fundraisingAvailableCents: 731 })).toBe(831)
    expect(availableFundsCents({ personalAvailableCents: null, fundraisingAvailableCents: 731 })).toBeNull()
    expect(availableFundsCents({ fundraisingAvailableCents: 731 })).toBeNull()
    const html = render([{ ...row, personalAvailableCents: 100 }])
    expect(html).toContain('Available funds')
    expect(html).toContain('$8.31')
    expect(html).toContain('$7.31')
  })
  it('sorts by Balance due with accounts that are not ready last, keeping the original order for ties', () => {
    const rows = [due('a', 0), due('b', 500), due('c', null, 'updating'), due('d', 500), due('e', 900)]
    expect(arrangeRows(rows, { sortByDue: true, dueOnly: false }).map(r => r.studentId)).toEqual(['e', 'b', 'd', 'a', 'c'])
    expect(arrangeRows(rows, { sortByDue: false, dueOnly: false }).map(r => r.studentId)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
  it('Balance due only keeps just the students who owe money', () => {
    const rows = [due('a', 0), due('b', 500), due('c', null, 'updating'), due('e', 900)]
    expect(arrangeRows(rows, { sortByDue: false, dueOnly: true }).map(r => r.studentId)).toEqual(['b', 'e'])
    expect(arrangeRows(rows, { sortByDue: true, dueOnly: true }).map(r => r.studentId)).toEqual(['e', 'b'])
  })
  it('offers Add a fee only where the viewer can edit a ready account', () => {
    expect(render([row])).not.toContain('Add a fee for')
    expect(render([{ ...row, canRecord: true }])).toContain('Add a fee for Fictional member')
    expect(render([{ ...row, canRecord: true, state: 'updating' }])).not.toContain('Add a fee for')
  })
})
