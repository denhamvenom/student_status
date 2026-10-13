import { describe, expect, it } from 'vitest'
import { FinancialMaintenanceNotice, reportMoney } from './DashboardReports'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

describe('financial report currency', () => {
  it('preserves exact cents for genuine gross totals across the supported range', () => {
    expect(reportMoney(0)).toBe('$0.00')
    expect(reportMoney(29)).toBe('$0.29')
    expect(reportMoney(Number.MAX_SAFE_INTEGER)).toBe('$90,071,992,547,409.91')
    expect(reportMoney(-1)).toBe('-$0.01')
  })
  it('shows maintenance independently of committed amounts and tolerates the earlier additive response', () => {
    expect(renderToStaticMarkup(createElement(FinancialMaintenanceNotice, {}))).toBe('')
    expect(renderToStaticMarkup(createElement(FinancialMaintenanceNotice, { maintenance: { state: 'ready', revision: 2 } }))).toBe('')
    const pending = renderToStaticMarkup(createElement(FinancialMaintenanceNotice, { maintenance: { state: 'applying', revision: 3 } }))
    expect(pending).toContain('role="status"')
    expect(pending).toContain('Displayed amounts remain the recorded totals')
    expect(pending).not.toContain('$0.00')
    const failed = renderToStaticMarkup(createElement(FinancialMaintenanceNotice, { maintenance: { state: 'failed', revision: 4 } }))
    expect(failed).toContain('role="alert"')
    expect(failed).toContain('New financial changes remain unavailable')
  })
})
