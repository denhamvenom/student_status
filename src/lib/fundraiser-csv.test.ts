import { describe, expect, it } from 'vitest'
import { collectFundraiserExport, fundraiserCsv, parseFundraiserCsv } from './fundraiser-csv'
const row = { studentId: 'synthetic123', name: 'Synthetic, "Student"\nSecond', revision: 2, url: 'https://zeffy.com/example' }
describe('fundraiser CSV', () => {
  it('round trips BOM, quoting and blank clears while guarding formula names', () => {
    expect(parseFundraiserCsv(fundraiserCsv([row]))).toEqual([row])
    expect(parseFundraiserCsv(fundraiserCsv([{ ...row, name: '=SUM(A1)', url: null }]))[0]).toMatchObject({ name: "'=SUM(A1)", url: null })
  })
  it('rejects changed headers, duplicate IDs, invalid revisions and oversized batches', () => {
    expect(() => parseFundraiserCsv(fundraiserCsv([row]).replace('Link Revision', 'Revision'))).toThrow('columns changed')
    expect(() => parseFundraiserCsv(fundraiserCsv([row, row]))).toThrow('same student twice')
    expect(() => parseFundraiserCsv(fundraiserCsv([{ ...row, revision: 1.5 }]))).toThrow('invalid')
    expect(() => parseFundraiserCsv(fundraiserCsv(Array.from({ length: 501 }, (_, index) => ({ ...row, studentId: `student${index}` }))))).toThrow('500')
    expect(() => parseFundraiserCsv('"Unclosed')).toThrow('unclosed')
  })
  it('exports every page and refuses a stuck cursor', async () => {
    expect(await collectFundraiserExport(async cursor => ({ page: [row], isDone: cursor === 'next', continueCursor: 'next' }))).toHaveLength(2)
    await expect(collectFundraiserExport(async () => ({ page: [], isDone: false, continueCursor: 'next' }))).rejects.toThrow('could not finish')
  })
})
