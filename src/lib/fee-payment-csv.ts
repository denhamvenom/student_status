import { readCsvCells } from './bulk-invite-csv'
import { parseChargeTarget } from './charge-money'

export const FEE_CSV_LIMIT = 500
export const FEE_CSV_BYTES = 1_000_000
export const FEE_CSV_HEADER = ['Export batch', 'Row key', 'Fee ID', 'Fee', 'Student ID', 'Charge ID', 'Student', 'Charged', 'Already applied', 'Owed', 'Charge revision', 'Financial generation', 'Financial revision', 'New payment amount'] as const

export type ExportFeeRow = {
  studentId: string; chargeId: string; studentName: string; chargedCents: number; appliedCents: number; owedCents: number;
  chargeRevision: number; financialGeneration: number; financialRevision: number
}
export type FeeCsvRow = {
  exportId: string; rowKey: string; feeDefinitionId: string; studentId: string; chargeId: string; studentName: string;
  chargedCents: number; appliedCents: number; owedCents: number; expectedChargeRevision: number;
  expectedFinancialGeneration: number; expectedFinancialRevision: number; amountCents: number | null
}
export type PaymentManifestRow = Pick<FeeCsvRow, 'rowKey' | 'studentId' | 'chargeId' | 'amountCents' | 'expectedChargeRevision' | 'expectedFinancialGeneration' | 'expectedFinancialRevision'> & { amountCents: number }

export async function collectFeeExport(fetchPage: (cursor: string | null) => Promise<{ feeLabel: string; page: ExportFeeRow[]; isDone: boolean; continueCursor: string }>) {
  const rows: ExportFeeRow[] = []
  let cursor: string | null = null
  for (let pages = 0; pages <= 10000; pages++) {
    const page = await fetchPage(cursor)
    rows.push(...page.page)
    if (rows.length > FEE_CSV_LIMIT) throw new Error('This selection has more than 500 assessed students. No partial file was downloaded.')
    if (page.isDone) {
      if (!rows.length) throw new Error('No assessed students match this fee and filter.')
      return { feeLabel: page.feeLabel, rows }
    }
    if (page.continueCursor === cursor) throw new Error('The fee export could not finish. Try again.')
    cursor = page.continueCursor
  }
  throw new Error('The fee export could not finish. Try again.')
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const id = /^[A-Za-z0-9_-]{8,100}$/
const centsText = (cents: number) => String(Math.trunc(cents / 100)) + '.' + String(cents % 100).padStart(2, '0')
const csvCell = (value: string, humanText = false) => {
  const guarded = humanText && /^[\s]*[=+@-]/.test(value) ? "'" + value : value
  return '"' + guarded.replaceAll('"', '""') + '"'
}

export function feePaymentCsv(feeDefinitionId: string, feeLabel: string, exportId: string, rows: ExportFeeRow[], key: () => string = () => crypto.randomUUID()) {
  if (!uuid.test(exportId) || !id.test(feeDefinitionId) || !rows.length || rows.length > FEE_CSV_LIMIT) throw new Error('Export 1 to 500 assessed students at a time. No partial file was downloaded.')
  const body = rows.map(row => [
    exportId, key(), feeDefinitionId, feeLabel, row.studentId, row.chargeId, row.studentName,
    centsText(row.chargedCents), centsText(row.appliedCents), centsText(row.owedCents),
    String(row.chargeRevision), String(row.financialGeneration), String(row.financialRevision), ''
  ].map((value, index) => csvCell(value, index === 3 || index === 6)).join(','))
  return '\uFEFF' + [FEE_CSV_HEADER.map(value => csvCell(value)).join(','), ...body].join('\r\n') + '\r\n'
}

export function parseFeePaymentCsv(input: string): { exportId: string; feeDefinitionId: string; rows: FeeCsvRow[]; payments: PaymentManifestRow[] } {
  if (new TextEncoder().encode(input).length > FEE_CSV_BYTES) throw new Error('The fee CSV is too large. Use a file under 1 MB.')
  const records = readCsvCells(input.replace(/^\uFEFF/, ''))
  const header = records.shift()
  if (!header || header.length !== FEE_CSV_HEADER.length || header.some((value, index) => value.trim() !== FEE_CSV_HEADER[index])) throw new Error('The fee CSV columns changed. Use an unmodified fee export, and edit only New payment amount.')
  const data = records.filter(row => row.some(value => value.trim()))
  if (!data.length || data.length > FEE_CSV_LIMIT) throw new Error('The fee CSV must contain 1 to 500 assessed students.')
  const rowKeys = new Set<string>(), chargeIds = new Set<string>()
  let exportId = '', feeDefinitionId = ''
  const rows = data.map((cells, index) => {
    const line = index + 2
    if (cells.length !== header.length) throw new Error('Row ' + line + ' has the wrong number of columns.')
    const value = (column: number) => cells[column].trim()
    if (!uuid.test(value(0)) || !uuid.test(value(1)) || !id.test(value(2)) || !id.test(value(4)) || !id.test(value(5))) throw new Error('Row ' + line + ' has an invalid export, row, fee, student, or charge ID.')
    if (exportId && value(0) !== exportId || feeDefinitionId && value(2) !== feeDefinitionId) throw new Error('The file mixes export batches or fees.')
    exportId = value(0); feeDefinitionId = value(2)
    if (rowKeys.has(value(1)) || chargeIds.has(value(5))) throw new Error('Row ' + line + ' repeats a row key or fee charge.')
    rowKeys.add(value(1)); chargeIds.add(value(5))
    const money = [7, 8, 9].map(column => parseChargeTarget(value(column)))
    if (money.some(cents => cents === null) || money[0]! - money[1]! !== money[2]!) throw new Error('Row ' + line + ' has invalid charged, applied, or owed amounts.')
    const revisions = [10, 11, 12].map(column => Number(value(column)))
    if (revisions.some((revision, position) => !/^\d+$/.test(value(position + 10)) || !Number.isSafeInteger(revision) || revision < (position === 1 ? 1 : 0))) throw new Error('Row ' + line + ' has an invalid version.')
    const amountCents = value(13) === '' ? null : parseChargeTarget(value(13))
    if (value(13) !== '' && (!amountCents || amountCents > money[2]!)) throw new Error('Row ' + line + ' needs a positive payment no greater than this fee balance.')
    return { exportId, rowKey: value(1), feeDefinitionId, studentId: value(4), chargeId: value(5), studentName: value(6), chargedCents: money[0]!, appliedCents: money[1]!, owedCents: money[2]!, expectedChargeRevision: revisions[0], expectedFinancialGeneration: revisions[1], expectedFinancialRevision: revisions[2], amountCents }
  })
  const payments = rows.filter((row): row is FeeCsvRow & { amountCents: number } => row.amountCents !== null).map(({ rowKey, studentId, chargeId, amountCents, expectedChargeRevision, expectedFinancialGeneration, expectedFinancialRevision }) => ({ rowKey, studentId, chargeId, amountCents, expectedChargeRevision, expectedFinancialGeneration, expectedFinancialRevision }))
  if (!payments.length) throw new Error('Enter at least one New payment amount. Blank rows are skipped.')
  return { exportId, feeDefinitionId, rows, payments }
}
