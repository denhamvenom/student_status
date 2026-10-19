import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FunctionReference } from 'convex/server'
import type { Id } from '../convex/_generated/dataModel'
import { ChargeAdministration, chargeCurrency, parseChargeTarget } from './ChargeAdministration'

const view = vi.hoisted(() => ({ loading: false, canCorrect: true, financialState: 'ready', failedJob: false }))
vi.mock('convex/react', async () => {
  const { getFunctionName } = await import('convex/server')
  return {
    useQuery: (query: FunctionReference<'query'>) => {
      if (view.loading) return undefined
      if (getFunctionName(query) === 'chargeAdmin:detail') return { charge: { label: 'Synthetic fee' }, amounts: { amountCents: 10000, adjustedCents: 0, cancelledCents: 0, effectiveCents: 10000, appliedCents: 10000, priority: 1, revision: 2 }, financialState: view.financialState, financialRevision: 3, canCorrect: view.canCorrect }
      return { job: view.failedJob ? { _id: 'job', state: 'failed', committedCents: 500, releaseRequiredCents: 1000, amountCents: 1000, originalEffectiveCents: 10000, targetEffectiveCents: 9000, reason: 'Synthetic correction', lastError: 'Synthetic failure' } : null, canRetry: view.failedJob, originalActorName: 'Synthetic Coach', processingActorName: 'Synthetic Coach', financialState: view.financialState }
    },
    usePaginatedQuery: () => ({ results: [], status: 'Exhausted', loadMore: vi.fn() }),
    useMutation: () => vi.fn(),
    useConvex: () => ({ query: vi.fn() }),
  }
})
beforeEach(() => { view.loading = false; view.canCorrect = true; view.financialState = 'ready'; view.failedJob = false })

describe('charge correction amount entry', () => {
  it('accepts an explicit zero target and preserves exact pennies', () => {
    expect(parseChargeTarget('0')).toBe(0)
    expect(parseChargeTarget('0.29')).toBe(29)
    expect(parseChargeTarget('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER)
    expect(chargeCurrency(Number.MAX_SAFE_INTEGER)).toBe('$90,071,992,547,409.91')
    expect(chargeCurrency(-29)).toBe('-$0.29')
  })
  it('rejects missing, negative, fractional penny and unsafe targets', () => {
    for (const text of ['', ' ', '-1', '0.001', '1e2', '90071992547409.92']) expect(parseChargeTarget(text)).toBeNull()
  })
})

describe('rendered charge administration controls', () => {
  const chargeId = 'synthetic-charge' as Id<'charges'>
  it('uses an explicit submit button for the Coach correction form', () => {
    const html = renderToStaticMarkup(createElement(ChargeAdministration, { chargeId, allowEditing: true }))
    expect(html).toContain('Review exact correction')
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Review exact correction<\/button>/)
  })
  it('uses an explicit submit button for failed-job retry and separates source progress from the target', () => {
    view.canCorrect = false; view.financialState = 'failed'; view.failedJob = true
    const html = renderToStaticMarkup(createElement(ChargeAdministration, { chargeId, allowEditing: true }))
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Retry remaining work<\/button>/)
    expect(html).toContain('Money already returned to available funds')
    expect(html).toContain('$5.00')
    expect(html).toContain('Planned amount')
    expect(html).not.toContain('Review exact correction')
  })
  it('shows family details without editing or retry forms', () => {
    view.failedJob = true
    const html = renderToStaticMarkup(createElement(ChargeAdministration, { chargeId }))
    expect(html).toContain('Synthetic fee')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('Review exact correction')
    expect(html).not.toContain('Retry remaining work')
  })
  it('does not show empty receipts or financial values during initial loading', () => {
    view.loading = true
    const html = renderToStaticMarkup(createElement(ChargeAdministration, { chargeId, allowEditing: true }))
    expect(html).toContain('Loading charge details')
    expect(html).not.toContain('No charge revisions')
    expect(html).not.toContain('$100.00')
    expect(html).not.toContain('<form')
  })
})
