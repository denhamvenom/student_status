import { describe, expect, it } from 'vitest'
import { collectFundraisingPreview, formatFundraisingCents, fundraisingDecimalValue, parseFundraisingDecimal } from './Fundraising'
import type { FunctionReturnType } from 'convex/server'
import type { Id } from '../convex/_generated/dataModel'
import { api } from '../convex/_generated/api'

describe('fundraising decimal entry', () => {
  it('preserves exact pennies and percentage hundredths', () => {
    expect(parseFundraisingDecimal('0.29')).toBe(29)
    expect(parseFundraisingDecimal('12.01')).toBe(1201)
    expect(parseFundraisingDecimal('33.33')).toBe(3333)
    expect(parseFundraisingDecimal('100')).toBe(10000)
    expect(parseFundraisingDecimal('0')).toBe(0)
    expect(parseFundraisingDecimal(' 1.5 ')).toBe(150)
  })

  it('rejects missing, fractional pennies, unsafe amounts and ambiguous formats', () => {
    for (const value of ['', ' ', '-1', '1.001', '1e3', '1,000', 'Infinity', '90071992547410']) {
      expect(parseFundraisingDecimal(value)).toBeNull()
    }
    expect(parseFundraisingDecimal('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER)
    expect(parseFundraisingDecimal('90071992547409.92')).toBeNull()
  })

  it('formats every penny even at the supported integer limit', () => {
    expect(formatFundraisingCents(Number.MAX_SAFE_INTEGER)).toBe('$90,071,992,547,409.91')
    expect(formatFundraisingCents(-1)).toBe('-$0.01')
    expect(fundraisingDecimalValue(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91')
    expect(parseFundraisingDecimal(fundraisingDecimalValue(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('bounded authoritative fundraising preview', () => {
  const input = { fundraiserId: 'fundraiser' as Id<'fundraisers'>, expectedRevision: 2, rows: Array.from({ length: 50 }, (_, index) => ({ studentId: `student${index}` as Id<'students'>, grossCents: index + 1 })) }
  const page = (rows: typeof input.rows): FunctionReturnType<typeof api.fundraisers.preview> => ({ fundraiserRevision: 2, rows: rows.map(row => ({ ...row, teamCents: row.grossCents, travelCreditCents: 0, grossDeltaCents: row.grossCents, teamDeltaCents: row.grossCents, travelDeltaCents: 0, expectedRowRevision: 0, expectedFinancialRevision: 1, availableOriginalCents: 0, requiredReductionCents: 0, state: 'ready', message: null })) })
  it('collects all rows in bounded pages while preserving true gross for team-only proceeds', async () => {
    const sizes: number[] = []
    const preview = await collectFundraisingPreview(async args => { sizes.push(args.rows.length); return page(args.rows) }, input)
    expect(sizes).toEqual([20, 20, 10])
    expect(preview.rows).toHaveLength(50)
    expect(preview.rows[49]).toMatchObject({ grossCents: 50, travelCreditCents: 0, teamCents: 50 })
  })
  it('rejects changed or incomplete pages without returning a partial preview', async () => {
    let calls = 0
    await expect(collectFundraisingPreview(async args => { calls++; return calls === 2 ? { ...page(args.rows), fundraiserRevision: 3 } : page(args.rows) }, input)).rejects.toThrow('preview changed')
    expect(calls).toBe(2)
    await expect(collectFundraisingPreview(async args => ({ ...page(args.rows), rows: [] }), input)).rejects.toThrow('preview changed')
    await expect(collectFundraisingPreview(async args => page(args.rows), { ...input, rows: [input.rows[0], input.rows[0]] })).rejects.toThrow('unique')
  })
  it('stops collecting after the selected workspace is left', async () => {
    let calls = 0
    await expect(collectFundraisingPreview(async args => { calls++; return page(args.rows) }, input, () => calls > 0)).rejects.toThrow('cancelled')
    expect(calls).toBe(1)
  })
})
