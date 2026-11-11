import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FinanceRecentChanges, amountChange, changeReason, type FinanceChangeRow } from './FinanceRecentChanges'
const row: FinanceChangeRow = { changeId:'synthetic', studentName:'Fictional member', actorName:'Fictional Coach', occurredAt:0, kind:'allocation', state:'progress', meaning:'applied', beforeCents:null, afterCents:101, deltaCents:101, reason:'Synthetic evidence', sourceKind:'payment', historical:true }
const render = (value: FinanceChangeRow) => renderToStaticMarkup(createElement(FinanceRecentChanges,{rows:[value],loading:false,loadingMore:false,hasMore:false,coverage:{state:'updating',startedAt:null,completedAt:null},onMore:()=>undefined}))
describe('typed finance change evidence',()=>{
  it('keeps incomplete progress and unavailable historical values explicit',()=>{
    const html=render(row)
    expect(html).toContain('Still processing. This amount may still change.')
    expect(html).toContain('Not recorded')
    expect(html).toContain('$1.01')
    expect(html).not.toContain('$0.00')
    expect(html).toContain(' - Payment')
    expect(html).not.toContain('not yet complete')
    expect(html).toContain('Earlier changes are still being prepared; this list may be incomplete')
  })
  it('renders priority as ranks rather than currency and never exposes raw unknown kinds',()=>{
    const html=render({...row,kind:'feePriority',meaning:'priority',beforeCents:12,afterCents:3,deltaCents:null,state:'committed',sourceKind:null})
    expect(html).toContain('12 → 3')
    expect(html).not.toContain('$')
    expect(html).not.toContain('Still processing. This amount may still change.')
    expect(render({...row,kind:'internalUnknownKind'})).not.toContain('internalUnknownKind')
  })
})


describe('finance history coverage and pagination', () => {
  it('shows only supplied preparation dates and preserves an empty nonfinal page', () => {
    const html = renderToStaticMarkup(createElement(FinanceRecentChanges, { rows: [], loading: false, loadingMore: false, hasMore: true, coverage: { state: 'updating', startedAt: 1791900000000, completedAt: null }, onMore: () => undefined }))
    expect(html).toContain('Historical preparation started:')
    expect(html).not.toContain('Historical preparation completed:')
    expect(html).toContain('More financial records are available')
    expect(html).not.toContain('No financial changes')
  })
  it('disables additional requests while loading and shows a supplied completion date', () => {
    const html = renderToStaticMarkup(createElement(FinanceRecentChanges, { rows: [], loading: false, loadingMore: true, hasMore: true, coverage: { state: 'ready', startedAt: null, completedAt: 1791900000000 }, onMore: () => undefined }))
    expect(html).toContain('Historical preparation completed:')
    expect(html).not.toContain('Historical preparation started:')
    expect(html).toMatch(/<button[^>]*disabled/)
  })
})

it('identifies team fee-order records without guessing a student', () => {
  const html = render({ ...row, kind: 'feePriority', meaning: 'priority', studentName: null, feeLabel: 'Fictional lunch fee', beforeCents: 2, afterCents: 1, deltaCents: null, sourceKind: null })
  expect(html).toContain('Fictional lunch fee')
  expect(html).toContain('Team')
  expect(html).toContain('2 → 1')
})

describe('how a changed amount reads', () => {
  const payment: FinanceChangeRow = { ...row, kind: 'paymentEdit', state: 'committed', meaning: 'receipt', historical: false, beforeCents: 112_500, afterCents: 0, deltaCents: 112_500, reason: 'Entered by mistake' }
  it('shows a lowered payment with a minus and plain words, even when the saved size is unsigned', () => {
    expect(amountChange(payment)).toEqual({ label: 'Change', text: 'Lowered by $1,125.00 (−$1,125.00)' })
    expect(amountChange({ ...payment, beforeCents: 4000, afterCents: 5000 })?.text).toBe('Raised by $10.00')
  })
  it('does not show a $0.00 change for a method-only edit; it shows what changed in words', () => {
    const edit = { ...payment, beforeCents: 4000, afterCents: 4000, deltaCents: 0, detail: 'Method: Check → Cash' }
    const html = render(edit)
    expect(html).toContain('Method: Check → Cash')
    expect(html).not.toContain('$40.00 → $40.00')
    expect(html).not.toContain('$0.00')
  })
  it('replaces the stand-in reason with plain words', () => {
    expect(changeReason('Money change recorded')).toBe('No reason given')
    expect(changeReason('Typed wrong amount')).toBe('Typed wrong amount')
  })
})
