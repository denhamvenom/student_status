import { readCsvCells } from './bulk-invite-csv'
export const FUNDRAISER_CSV_LIMIT = 500
export const FUNDRAISER_CSV_BYTES = 2_000_000
const header = ['Student ID', 'Student Name', 'Link Revision', 'Fundraiser Link']
export type FundraiserCsvRow = { studentId: string; name: string; revision: number; url: string | null }
const cell = (value: string) => '"' + (/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"'
export function fundraiserCsv(rows: FundraiserCsvRow[]) {
  return '\uFEFF' + [header.map(cell).join(','), ...rows.map(row => [row.studentId, row.name, String(row.revision), row.url ?? ''].map(cell).join(','))].join('\r\n') + '\r\n'
}
export function parseFundraiserCsv(input: string): FundraiserCsvRow[] {
  if (new TextEncoder().encode(input).length > FUNDRAISER_CSV_BYTES) throw new Error('Use a CSV under 2 MB.')
  const records = readCsvCells(input.replace(/^\uFEFF/, ''))
  if (records[0]?.length !== header.length || records[0].some((value, index) => value.trim() !== header[index])) throw new Error('The CSV columns changed. Download the current CSV and edit only Fundraiser Link.')
  const rows = records.slice(1).filter(row => row.some(value => value.trim()))
  if (!rows.length || rows.length > FUNDRAISER_CSV_LIMIT) throw new Error('Import 1 to 500 students at a time.')
  const seen = new Set<string>()
  return rows.map((row, index) => {
    if (row.length !== header.length) throw new Error(`Row ${index + 2} has the wrong number of columns.`)
    const [studentId, name, revisionText, url] = row.map(value => value.trim())
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(studentId) || !/^\d+$/.test(revisionText) || !Number.isSafeInteger(Number(revisionText))) throw new Error(`Row ${index + 2} has an invalid Student ID or Link Revision. Download a fresh CSV.`)
    if (seen.has(studentId)) throw new Error('The CSV lists the same student twice. Remove the extra row, then import again.')
    seen.add(studentId)
    if (url.length > 2048) throw new Error(`Row ${index + 2} has a link longer than 2048 characters.`)
    return { studentId, name, revision: Number(revisionText), url: url || null }
  })
}
export async function collectFundraiserExport(fetchPage: (cursor: string | null) => Promise<{ page: FundraiserCsvRow[]; isDone: boolean; continueCursor: string }>) {
  const rows: FundraiserCsvRow[] = []
  let cursor: string | null = null
  for (let count = 0; count < 10000; count++) {
    const page = await fetchPage(cursor)
    rows.push(...page.page)
    if (page.isDone) return rows
    if (page.continueCursor === cursor) throw new Error('Export could not finish. Try again.')
    cursor = page.continueCursor
  }
  throw new Error('Export could not finish. Try again.')
}
