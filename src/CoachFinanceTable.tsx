import { Button } from './components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './components/ui/table'
import { financeAdminCopy as copy } from './lib/finance-admin-copy'
import { chargeCurrency } from './lib/charge-money'
import styles from './CoachFinanceTable.module.css'

export type FinanceStudentRow = {
  studentId: string; name: string; state: 'ready' | 'updating' | 'failed' | 'uninitialized'
  chargedCents: number | null; personalAppliedCents: number | null; fundraisingAppliedCents: number | null
  dueCents: number | null; fundraisingAvailableCents: number | null
  updatedAt: number | null; canRecord: boolean; canRebuild?: boolean
}
const columns = [
  ['chargedCents', copy.charged], ['personalAppliedCents', copy.paid],
  ['fundraisingAppliedCents', copy.credits], ['dueCents', copy.balance], ['fundraisingAvailableCents', copy.travel],
] as const
function amount(row: FinanceStudentRow, key: typeof columns[number][0]) {
  const value = row[key]
  return row.state === 'ready' && value !== null && Number.isSafeInteger(value) ? chargeCurrency(value) : copy.unavailable
}
function RowStatus({ row }: { row: FinanceStudentRow }) {
  return row.state !== 'ready' ? <span className={styles.note}>{copy[row.state]}</span> : row.updatedAt !== null ? <span className={styles.note}>{copy.updated} {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }).format(row.updatedAt)}</span> : null
}
export function CoachFinanceTable({ rows, loading, loadingMore, hasMore, onMore, onOpen, onRecord, onRebuild, rebuildingId }: {
  rows: FinanceStudentRow[]; loading: boolean; loadingMore: boolean; hasMore: boolean
  onRebuild?: (id: string) => void; rebuildingId?: string | null
  onMore: () => void; onOpen: (id: string, name: string) => void; onRecord: (id: string, name: string) => void
}) {
  const actions = (row: FinanceStudentRow) => <div className={styles.actions}>{row.canRecord && row.state === 'ready' && <Button type="button" variant="outline" aria-label={copy.recordFor(row.name)} onClick={() => onRecord(row.studentId, row.name)}>{copy.record}</Button>}{row.canRebuild && row.state !== 'ready' && onRebuild && <Button type="button" variant="outline" disabled={!!rebuildingId} aria-label={copy.prepareFor(row.name)} onClick={() => onRebuild(row.studentId)}>{rebuildingId === row.studentId ? copy.preparing : copy.prepare}</Button>}</div>
  return <section className={styles.root} aria-label={copy.title}>
    <h2>{copy.title}</h2><p className={styles.note}>{copy.explanation}</p>
    {loading ? <p role="status">{copy.loading}</p> : rows.length === 0 ? <p role="status">{hasMore || loadingMore ? copy.continuing : copy.empty}</p> : <>
      <div className={styles.desktop}><Table><TableHeader><TableRow><TableHead>{copy.student}</TableHead>{columns.map(([, label]) => <TableHead className={styles.money} key={label}>{label}</TableHead>)}<TableHead><span className="sr-only">{copy.details}</span></TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.studentId}><TableCell><Button type="button" variant="link" className={styles.name} aria-label={copy.viewAccount(row.name)} onClick={() => onOpen(row.studentId, row.name)}>{row.name}</Button><RowStatus row={row}/></TableCell>{columns.map(([key]) => <TableCell key={key} className={styles.money}>{amount(row,key)}</TableCell>)}<TableCell>{actions(row)}</TableCell></TableRow>)}</TableBody></Table></div>
      <div className={styles.mobile}>{rows.map(row => <article className={styles.account} key={row.studentId}><h3><Button type="button" variant="link" className={styles.name} aria-label={copy.viewAccount(row.name)} onClick={() => onOpen(row.studentId, row.name)}>{row.name}</Button></h3><RowStatus row={row}/><dl>{columns.map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{amount(row,key)}</dd></div>)}</dl>{actions(row)}</article>)}</div>
    </>}
    {(hasMore || loadingMore) && <Button type="button" variant="outline" disabled={loading || loadingMore} onClick={onMore}>{loadingMore ? copy.loadingMore : copy.more}</Button>}
  </section>
}
