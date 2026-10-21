import { getFunctionName } from 'convex/server'
import { api } from '../convex/_generated/api'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(), usePaginatedQuery: vi.fn(), useMutation: vi.fn(),
}))
vi.mock('convex/react', () => mocks)
import { CoachFinanceAccounts, CoachFinanceChanges } from './CoachFinanceWorkspace'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.usePaginatedQuery.mockReturnValue({ results: [], status: 'Exhausted', loadMore: vi.fn() })
  mocks.useMutation.mockReturnValue(vi.fn())
  mocks.useQuery.mockReturnValue({ coverage: { state: 'updating', startedAt: null, completedAt: null }, canPrepareHistory: false })
})
describe('financial query presentation integration', () => {
  it('subscribes to student accounts with a bounded server page', () => {
    mocks.usePaginatedQuery.mockReturnValue({ results: [], status: 'CanLoadMore', loadMore: vi.fn() })
    const html = renderToStaticMarkup(createElement(CoachFinanceAccounts, { onOpen: vi.fn(), onRecord: vi.fn() }))
    expect(html).toContain('Student accounts')
    const subscriptions = mocks.usePaginatedQuery.mock.calls.filter(([reference]) => getFunctionName(reference) === getFunctionName(api.financeAdmin.students))
    expect(subscriptions).toHaveLength(1)
    const [, args, options] = subscriptions[0]
    expect(args).toEqual({})
    expect(Number.isSafeInteger(options.initialNumItems)).toBe(true)
    expect(options.initialNumItems).toBeGreaterThan(0)
    expect(options.initialNumItems).toBeLessThanOrEqual(20)
  })
  it('only offers historical preparation when the server permits it', () => {
    expect(renderToStaticMarkup(createElement(CoachFinanceChanges))).not.toContain('Prepare historical changes')
    mocks.useQuery.mockReturnValue({ coverage: { state: 'failed', startedAt: 1791900000000, completedAt: null }, canPrepareHistory: true })
    const html = renderToStaticMarkup(createElement(CoachFinanceChanges))
    expect(html).toContain('Prepare historical changes')
    expect(html).toContain('Historical preparation started:')
    expect(html).not.toContain('Historical preparation completed:')
    expect(html).toContain('Earlier changes need Coach review; this list may be incomplete')
  })
  it('keeps initial history loading separate from empty history', () => {
    mocks.usePaginatedQuery.mockReturnValue({ results: [], status: 'LoadingFirstPage', loadMore: vi.fn() })
    mocks.useQuery.mockReturnValue(undefined)
    const html = renderToStaticMarkup(createElement(CoachFinanceChanges))
    expect(html).toContain('Loading financial changes')
    expect(html).not.toContain('No financial changes')
    expect(html).not.toContain('Prepare historical changes')
  })
})

describe('server-gated account recovery', () => {
  it('offers recovery only for an unavailable row the server permits and explains maintenance', () => {
    const row = { studentId: 'fictional', name: 'Fictional member', state: 'updating', chargedCents: null, personalAppliedCents: null, fundraisingAppliedCents: null, dueCents: null, fundraisingAvailableCents: null, updatedAt: null, canRecord: false, canRebuild: true }
    mocks.usePaginatedQuery.mockReturnValue({ results: [row], status: 'Exhausted', loadMore: vi.fn() })
    mocks.useQuery.mockReturnValue({ maintenance: { state: 'failed', revision: 1 } })
    const render = () => renderToStaticMarkup(createElement(CoachFinanceAccounts, { onOpen: vi.fn(), onRecord: vi.fn() }))
    expect(render()).toContain('Prepare account for Fictional member')
    expect(render()).toContain('Shared fee maintenance needs Coach review')
    expect(render()).not.toContain('Record payment for')
    mocks.usePaginatedQuery.mockReturnValue({ results: [{ ...row, canRebuild: false }], status: 'Exhausted', loadMore: vi.fn() })
    expect(render()).not.toContain('Prepare account for')
  })
})
