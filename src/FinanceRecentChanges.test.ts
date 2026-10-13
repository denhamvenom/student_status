import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FinanceRecentChanges, type FinanceChangeRow } from './FinanceRecentChanges'
const row: FinanceChangeRow = { changeId:'synthetic', studentName:'Fictional member', actorName:'Fictional Coach', occurredAt:0, kind:'allocation', state:'progress', meaning:'applied', beforeCents:null, afterCents:101, deltaCents:101, reason:'Synthetic evidence', sourceKind:'payment', historical:true }
const render = (value: FinanceChangeRow) => renderToStaticMarkup(createElement(FinanceRecentChanges,{rows:[value],loading:false,loadingMore:false,hasMore:false,coverage:{state:'updating',startedAt:null,completedAt:null},onMore:()=>undefined}))
describe('typed finance change evidence',()=>{
  it('keeps incomplete progress and unavailable historical values explicit',()=>{
    const html=render(row)
    expect(html).toContain('this entry is not a completion receipt')
    expect(html).toContain('Not recorded')
    expect(html).toContain('$1.01')
    expect(html).not.toContain('$0.00')
    expect(html).toContain('Personal payment')
    expect(html).not.toContain('not yet complete')
    expect(html).toContain('Historical change coverage is updating')
  })
  it('renders priority as ranks rather than currency and never exposes raw unknown kinds',()=>{
    const html=render({...row,kind:'feePriority',meaning:'priority',beforeCents:12,afterCents:3,deltaCents:null,state:'committed',sourceKind:null})
    expect(html).toContain('12 → 3')
    expect(html).not.toContain('$')
    expect(html).not.toContain('this entry is not a completion receipt')
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
