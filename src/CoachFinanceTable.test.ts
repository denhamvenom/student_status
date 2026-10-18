import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CoachFinanceTable, type FinanceStudentRow } from './CoachFinanceTable'

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
