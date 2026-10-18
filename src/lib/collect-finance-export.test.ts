import { expect, it } from 'vitest'
import { collectFinanceExport, type ExportMember, type ExportPage, type ExportReader } from './collect-finance-export'
const member: ExportMember = { studentId: 'fictional', name: 'Example', generation: 1, financialRevision: 2, chargeCount: 0, capturedAt: 1 }
const page = <T,>(rows: T[], isDone = true, continueCursor = ''): ExportPage<T> => ({ page: rows, isDone, continueCursor, scopeHash: 'scope', collectedAt: 2 })
const expected = { scopeHash: 'scope', memberCount: 1, columns: ['Student'] }
const reader = (): ExportReader => ({ members: async () => page([member]), charges: async () => page([]), verify: async () => page([member]) })
it('retains zero-charge members in metadata without inventing charge rows', async () => {
  const result = await collectFinanceExport(reader(), expected, new AbortController().signal)
  expect(result.csv).toBe('"Student"\r\n')
  expect(result.manifest.members).toEqual([member])
})
it('collects across empty nonfinal pages', async () => {
  const source = reader(); source.members = async cursor => cursor ? page([member]) : page([], false, 'next')
  expect((await collectFinanceExport(source, expected, new AbortController().signal)).manifest.members).toHaveLength(1)
})
it('rejects a final revision change instead of returning a partial export', async () => {
  const source = reader(); source.verify = async () => page([{ ...member, financialRevision: 3 }])
  await expect(collectFinanceExport(source, expected, new AbortController().signal)).rejects.toThrow('Accounts changed')
})
it('discards collection after permission denial or cancellation', async () => {
  const source = reader(); source.verify = async () => { throw new Error('Access denied') }
  await expect(collectFinanceExport(source, expected, new AbortController().signal)).rejects.toThrow('Access denied')
  const controller = new AbortController(); controller.abort()
  await expect(collectFinanceExport(reader(), expected, controller.signal)).rejects.toThrow()
})
