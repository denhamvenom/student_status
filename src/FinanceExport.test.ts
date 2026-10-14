import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Id } from '../convex/_generated/dataModel'
const mocks = vi.hoisted(() => ({ useQuery: vi.fn(), useMutation: vi.fn(), useConvex: vi.fn() }))
vi.mock('convex/react', () => mocks)
import { FinanceExport } from './FinanceExport'
beforeEach(() => { mocks.useQuery.mockReturnValue(undefined); mocks.useMutation.mockReturnValue(vi.fn()); mocks.useConvex.mockReturnValue({ mutation: vi.fn() }) })
it('offers the complete active scope without pretending an unprepared file is available', () => {
  const html = renderToStaticMarkup(createElement(FinanceExport))
  expect(html).toContain('All active students'); expect(html).toContain('Prepare export'); expect(html).not.toContain('Download charge details (CSV)'); expect(html).not.toContain('Download student list and collection details (JSON)')
  expect(html).toContain('collected over a time range'); expect(html).toContain('those with no charges')
  expect(mocks.useQuery.mock.calls.at(-1)?.[1]).toBe('skip')
})
it('offers selected-student export only when an explicit student was supplied', () => {
  const html = renderToStaticMarkup(createElement(FinanceExport, { selectedStudentId: 'synthetic' as Id<'students'>, selectedStudentName: 'Fictional Member' }))
  expect(html).toContain('value="selected" selected=""'); expect(html).toContain('Fictional Member'); expect(html).toContain('All active students')
  expect(renderToStaticMarkup(createElement(FinanceExport))).not.toContain('value="selected"')
})
it('shows pending membership capture without offering partial downloads and honors disabled writes', () => {
  mocks.useQuery.mockReturnValue({ state: 'preparing', memberCount: 20 })
  const html = renderToStaticMarkup(createElement(FinanceExport, { disabled: true }))
  expect(html).toContain('Students included: 20'); expect(html).toContain('disabled=""'); expect(html).not.toContain('Download charge details (CSV)')
})
