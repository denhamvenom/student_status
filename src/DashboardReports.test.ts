import { describe, expect, it } from 'vitest'
import { FinancialMaintenanceNotice, fundraisingReportValues } from './DashboardReports'
import { chargeCurrency } from './lib/charge-money'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { reportCopy } from './lib/report-copy'

describe('financial report currency', () => {
  it('preserves exact cents for genuine gross totals across the supported range', () => {
    expect(chargeCurrency(0)).toBe('$0.00')
    expect(chargeCurrency(29)).toBe('$0.29')
    expect(chargeCurrency(Number.MAX_SAFE_INTEGER)).toBe('$90,071,992,547,409.91')
    expect(chargeCurrency(-1)).toBe('-$0.01')
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

it('names earned fundraising separately from spendable credit and explains unknown gross', () => {
  expect(reportCopy.travelShare).toBe('Earned from fundraisers')
  expect(reportCopy.earned).toBe(reportCopy.travelShare)
  expect(reportCopy.fundraising).toBe('Available fundraising credit')
  expect(reportCopy.earned).not.toBe(reportCopy.fundraising)
  expect(reportCopy.grossUnavailable).toBe("Older fundraising credits don't include the full amount raised. Transfers and carried-over credit are not counted as money raised.")
  expect(reportCopy.teamGrossUnavailable).toBe(reportCopy.grossUnavailable)
  const amounts = fundraisingReportValues(0, 625)
  expect(amounts.earned).toEqual({label:'Earned from fundraisers',value:'$0.00'})
  expect(amounts.available).toEqual({label:'Available fundraising credit',value:'$6.25'})
})
