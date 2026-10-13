import { describe, expect, it } from 'vitest'
import { reportMoney } from './DashboardReports'

describe('financial report currency', () => {
  it('preserves exact cents for genuine gross totals across the supported range', () => {
    expect(reportMoney(0)).toBe('$0.00')
    expect(reportMoney(29)).toBe('$0.29')
    expect(reportMoney(Number.MAX_SAFE_INTEGER)).toBe('$90,071,992,547,409.91')
    expect(reportMoney(-1)).toBe('-$0.01')
  })
})
