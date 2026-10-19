import { describe, expect, it } from 'vitest'
import { collectFeeExport, feePaymentCsv, parseFeePaymentCsv } from './fee-payment-csv'

const feeId = 'fee01234567890'
const exportId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const rowKey = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const fixture = () => feePaymentCsv(feeId, 'Team Fee', exportId, [{
  studentId: 'student01234567890', chargeId: 'charge01234567890', studentName: '=2+2', chargedCents: 7500,
  appliedCents: 2500, owedCents: 5000, chargeRevision: 2, financialGeneration: 1, financialRevision: 3
}], () => rowKey)
const withAmount = (amount: string) => fixture().replace(',""\r\n', ',"' + amount + '"\r\n')

describe('fee payment CSV', () => {
  it('loads through sparse filtered pages and refuses to download a truncated 501-row export', async () => {
    const row = { studentId: 'student01234567890', chargeId: 'charge01234567890', studentName: 'Synthetic', chargedCents: 7500, appliedCents: 0, owedCents: 7500, chargeRevision: 0, financialGeneration: 1, financialRevision: 0 }
    const calls: Array<string | null> = []
    const result = await collectFeeExport(async cursor => { calls.push(cursor); return cursor === null ? { feeLabel: 'Team Fee', page: [], isDone: false, continueCursor: 'next' } : { feeLabel: 'Team Fee', page: [row], isDone: true, continueCursor: 'end' } })
    expect(calls).toEqual([null, 'next'])
    expect(result.rows).toEqual([row])
    await expect(collectFeeExport(async () => ({ feeLabel: 'Team Fee', page: Array(501).fill(row), isDone: true, continueCursor: 'end' }))).rejects.toThrow('No partial file')
  })
  it('exports guarded names and retains exact batch, row, charge, and version identity', () => {
    const csv = withAmount('12.34')
    expect(csv).toContain("\"'=2+2\"")
    const parsed = parseFeePaymentCsv(csv)
    expect(parsed.exportId).toBe(exportId)
    expect(parsed.payments).toEqual([{ rowKey, studentId: 'student01234567890', chargeId: 'charge01234567890', amountCents: 1234, expectedChargeRevision: 2, expectedFinancialGeneration: 1, expectedFinancialRevision: 3 }])
  })
  it('skips blank amounts and rejects a file with nothing to pay', () => {
    expect(() => parseFeePaymentCsv(fixture())).toThrow('Enter at least one')
  })
  it('rejects rounded, zero, overpaid, and formula amounts', () => {
    for (const amount of ['1.999', '0', '50.01', '=1+2']) expect(() => parseFeePaymentCsv(withAmount(amount))).toThrow('positive payment')
  })
  it('rejects duplicate headers, duplicate row keys, and changed identifiers', () => {
    expect(() => parseFeePaymentCsv(withAmount('1').replace('Row key', 'Export batch'))).toThrow('columns changed')
    const first = withAmount('1')
    const duplicate = first + first.split('\r\n')[1] + '\r\n'
    expect(() => parseFeePaymentCsv(duplicate)).toThrow('repeats a row key')
    expect(() => parseFeePaymentCsv(first.replace(feeId, 'broken'))).toThrow('invalid export')
  })
  it('rejects malformed columns and inconsistent visible balances', () => {
    expect(() => parseFeePaymentCsv(withAmount('1').replace(',"1"\r\n', '\r\n'))).toThrow('wrong number of columns')
    expect(() => parseFeePaymentCsv(withAmount('1').replace('"50.00"', '"49.99"'))).toThrow('invalid charged')
  })
})
