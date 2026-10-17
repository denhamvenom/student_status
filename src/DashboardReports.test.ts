import { describe, expect, it } from 'vitest'
import { FinancialMaintenanceNotice, fundraisingReportValues, reportMoney } from './DashboardReports'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { classifiedTime, HOUR_MS } from '../convex/lib/timeclock'
import { attendanceDuration, attendanceEligibilityText } from './lib/attendance-display'
import { reportCopy } from './lib/report-copy'

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

describe('attendance shown to families', () => {
  const start = 10 * HOUR_MS
  const end = 12 * HOUR_MS
  const result = (intervals: {inAt:number;outAt:number}[]) => {
    const calculation = classifiedTime(intervals, start, end, end)
    return attendanceEligibilityText({state:'closed',needsReview:false,...calculation})
  }

  it('shows seconds below the one-hour threshold instead of rounding up to 60 minutes', () => {
    expect(attendanceDuration(59 * 60_000 + 40_000)).toBe('59 min 40 s')
    expect(result([{inAt:start,outAt:start + 59 * 60_000 + 40_000}])).toContain('Longest visit: 59 min 40 s')
    expect(attendanceDuration(HOUR_MS - 1)).toBe('59 min 59 s')
    expect(result([{inAt:start,outAt:start + HOUR_MS}])).toBe(reportCopy.qualifies)
    expect(attendanceDuration(HOUR_MS)).toBe('60 min')
  })

  it('explains split visits using the longest uninterrupted time', () => {
    const visits = classifiedTime([{inAt:start,outAt:start+30*60_000},{inAt:start+HOUR_MS,outAt:start+HOUR_MS+30*60_000}],start,end,end)
    expect(visits.scheduledMs).toBe(HOUR_MS)
    expect(visits.qualifies).toBe(false)
    expect(attendanceEligibilityText({state:'closed',needsReview:false,...visits})).toContain('Longest visit: 30 min')
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
