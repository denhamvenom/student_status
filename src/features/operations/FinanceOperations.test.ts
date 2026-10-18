import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import { TeamTransferReview, teamTransferReviewReady } from './FinanceOperations'

const preview: FunctionReturnType<typeof api.financeOperations.previewTeamTransfer> = { destination: 'team', state: 'ready', fundraisingAvailableCents: Number.MAX_SAFE_INTEGER, amountCents: Number.MAX_SAFE_INTEGER, expectedFinancialRevision: 3, message: null }

describe('team transfer review', () => {
  it('renders every requested penny and explicit review/submit button types', () => {
    const html = renderToStaticMarkup(createElement(TeamTransferReview, { preview, current: preview, amountCents: preview.amountCents, busy: false, reasonValid: true, onReview: () => undefined }))
    expect(html).toContain('$90,071,992,547,409.91')
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Review transfer to team<\/button>/)
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Confirm reviewed team transfer<\/button>/)
    expect(teamTransferReviewReady(preview, preview, preview.amountCents)).toBe(true)
  })
  it('blocks confirmation after a financial revision changes or while updating', () => {
    const current = { ...preview, expectedFinancialRevision: 4 }
    expect(teamTransferReviewReady(preview, current, preview.amountCents)).toBe(false)
    expect(teamTransferReviewReady(preview, { ...preview, state: 'updating', fundraisingAvailableCents: null, expectedFinancialRevision: null, message: 'Financial preparation must finish.' }, preview.amountCents)).toBe(false)
    const html = renderToStaticMarkup(createElement(TeamTransferReview, { preview, current, amountCents: preview.amountCents, busy: false, reasonValid: true, onReview: () => undefined }))
    expect(html.match(/<button[^>]*type="submit"[^>]*>/)?.[0]).toContain('disabled')
  })
  it('does not manufacture zero balances before a preview loads', () => {
    const html = renderToStaticMarkup(createElement(TeamTransferReview, { preview: null, current: undefined, amountCents: null, busy: false, reasonValid: false, onReview: () => undefined }))
    expect(html).not.toContain('$0.00')
    expect(html.match(/<button[^>]*type="submit"[^>]*>/)?.[0]).toContain('disabled')
  })
})
