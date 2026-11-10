import { useId, useState } from 'react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Dialog, DialogContent, DialogTitle } from './components/ui/dialog'
import { ChargeEditor } from './Withdrawals'
import type { Id } from '../convex/_generated/dataModel'
import { chargeAdministrationCopy } from './lib/charge-administration-copy'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './components/ui/table'
import { financeAdminCopy as copy } from './lib/finance-admin-copy'
import { liveCopy } from './lib/live-copy'
import { chargeCurrency } from './lib/charge-money'
import styles from './CoachFinanceTable.module.css'

export type FinanceStudentRow = {
  studentId: string; name: string; state: 'ready' | 'updating' | 'failed' | 'uninitialized'
  chargedCents: number | null; personalAppliedCents: number | null; fundraisingAppliedCents: number | null
  dueCents: number | null; fundraisingAvailableCents: number | null; personalAvailableCents?: number | null
  updatedAt: number | null; canRecord: boolean; canRebuild?: boolean
}
const tableCopy = chargeAdministrationCopy.moneyTable
const columns = [
  ['chargedCents', copy.charged], ['personalAppliedCents', copy.paid],
  ['fundraisingAppliedCents', copy.credits], ['dueCents', copy.balance], ['availableFundsCents', tableCopy.availableFunds], ['fundraisingAvailableCents', copy.travel],
] as const
type ColumnKey = typeof columns[number][0]
/** Available funds: unused payments plus unused fundraising credit. Reports shows this same sum, so the two screens match. */
export function availableFundsCents(row: Pick<FinanceStudentRow, 'personalAvailableCents' | 'fundraisingAvailableCents'>): number | null {
  const { personalAvailableCents: personal, fundraisingAvailableCents: fundraising } = row
  if (personal === null || personal === undefined || fundraising === null || fundraising === undefined) return null
  const total = personal + fundraising
  return Number.isSafeInteger(total) ? total : null
}
/** Sorts by Balance due (most owed first, accounts without a figure last), optionally keeps only students who owe, and optionally keeps names that contain every word typed. */
export function arrangeRows<R extends Pick<FinanceStudentRow, 'dueCents' | 'state' | 'name'>>(rows: readonly R[], options: { sortByDue: boolean; dueOnly: boolean; query?: string }): R[] {
  const due = (row: R) => row.state === 'ready' && row.dueCents !== null ? row.dueCents : null
  const terms = (options.query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const named = terms.length ? rows.filter(row => terms.every(term => row.name.toLowerCase().includes(term))) : rows
  const kept = options.dueOnly ? named.filter(row => (due(row) ?? 0) > 0) : [...named]
  if (!options.sortByDue) return kept
  return kept.map((row, index) => ({ row, index })).sort((a, b) => (due(b.row) ?? -1) - (due(a.row) ?? -1) || a.index - b.index).map(item => item.row)
}
function amount(row: FinanceStudentRow, key: ColumnKey) {
  const value = key === 'availableFundsCents' ? availableFundsCents(row) : row[key]
  return row.state === 'ready' && value !== null && Number.isSafeInteger(value) ? chargeCurrency(value) : copy.unavailable
}
function RowStatus({ row }: { row: FinanceStudentRow }) {
  return row.state !== 'ready' ? <span className={styles.note}>{copy[row.state]}</span> : row.updatedAt !== null ? <span className={styles.note}>{copy.updated} {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }).format(row.updatedAt)}</span> : null
}
export function CoachFinanceTable({ rows, loading, loadingMore, hasMore, onMore, onOpen, onRecord, onRebuild, rebuildingId, canEdit = true }: {
  rows: FinanceStudentRow[]; loading: boolean; loadingMore: boolean; hasMore: boolean; canEdit?: boolean
  onRebuild?: (id: string) => void; rebuildingId?: string | null
  onMore: () => void; onOpen: (id: string, name: string) => void; onRecord: (id: string, name: string) => void
}) {
  const [sortByDue, setSortByDue] = useState(false)
  const [dueOnly, setDueOnly] = useState(false)
  const [query, setQuery] = useState('')
  const searchId = useId()
  const [feeFor, setFeeFor] = useState<{ id: string; name: string } | null>(null)
  const shown = arrangeRows(rows, { sortByDue, dueOnly, query })
  const actions = (row: FinanceStudentRow, mobile = false) => <div className={styles.actions}>{row.canRecord && row.state === 'ready' && <Button type="button" variant={mobile ? 'default' : 'outline'} className={mobile ? 'w-full' : undefined} aria-label={copy.recordFor(row.name)} onClick={() => onRecord(row.studentId, row.name)}>{mobile ? liveCopy.financeAdmin.recordPayment : copy.record}</Button>}{row.canRecord && row.state === 'ready' && <Button type="button" variant="outline" className={mobile ? 'w-full' : undefined} aria-label={tableCopy.addFeeFor(row.name)} onClick={() => setFeeFor({ id: row.studentId, name: row.name })}>{tableCopy.addFee}</Button>}{row.canRebuild && row.state !== 'ready' && onRebuild && <Button type="button" variant="outline" disabled={!!rebuildingId} aria-label={copy.prepareFor(row.name)} onClick={() => onRebuild(row.studentId)}>{rebuildingId === row.studentId ? copy.preparing : copy.prepare}</Button>}</div>
  return <section className={styles.root} aria-label={copy.title}>
    <h2>{copy.title}</h2>{!canEdit && <p className={styles.note}>{copy.whoCanAct}</p>}<details className={styles.note}><summary>{copy.columnHelp}</summary><p>{copy.explanation}</p><p>{tableCopy.availableHelp}</p></details>
    {rows.length > 0 && <div className={styles.search}><label htmlFor={searchId}>{tableCopy.searchLabel}</label><Input id={searchId} type="search" value={query} placeholder={tableCopy.searchPlaceholder} autoComplete="off" onChange={event => setQuery(event.target.value)}/></div>}
    {rows.length > 0 && <div className={styles.actions} role="group" aria-label={tableCopy.sortDue}><Button type="button" variant={sortByDue ? 'default' : 'outline'} aria-pressed={sortByDue} onClick={() => setSortByDue(!sortByDue)}>{sortByDue ? tableCopy.sortedDue : tableCopy.sortDue}</Button><Button type="button" variant={dueOnly ? 'default' : 'outline'} aria-pressed={dueOnly} onClick={() => setDueOnly(!dueOnly)}>{tableCopy.dueOnly}</Button></div>}
    {loading ? <p role="status">{copy.loading}</p> : rows.length === 0 ? <p role="status">{hasMore || loadingMore ? copy.continuing : copy.empty}</p> : <>
      <div className={styles.desktop}><Table containerProps={{ tabIndex: 0, role: "region", "aria-label": "Student balances. Scroll to see all columns and students." }}><TableHeader><TableRow><TableHead>{copy.student}</TableHead>{columns.map(([, label]) => <TableHead className={styles.money} key={label}>{label}</TableHead>)}<TableHead><span className="sr-only">{copy.details}</span></TableHead></TableRow></TableHeader><TableBody>{shown.map(row => <TableRow key={row.studentId}><TableCell><Button type="button" variant="link" className={styles.name} aria-label={copy.viewAccount(row.name)} onClick={() => onOpen(row.studentId, row.name)}>{row.name}</Button><RowStatus row={row}/></TableCell>{columns.map(([key]) => <TableCell key={key} className={styles.money}>{amount(row,key)}</TableCell>)}<TableCell>{actions(row)}</TableCell></TableRow>)}</TableBody></Table></div>
      <div className={styles.mobile}>{shown.map(row => <article className={styles.account} key={row.studentId}><h3><Button type="button" variant="link" className={styles.name} aria-label={copy.viewAccount(row.name)} onClick={() => onOpen(row.studentId, row.name)}>{row.name}</Button></h3><RowStatus row={row}/><dl>{columns.map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{amount(row,key)}</dd></div>)}</dl>{actions(row, true)}</article>)}</div>
      {query.trim() && shown.length === 0 && <p role="status">{tableCopy.noMatch}</p>}{!query.trim() && dueOnly && shown.length === 0 && <p role="status">{tableCopy.noneOwe}</p>}{query.trim() && hasMore && <p className={styles.note}>{tableCopy.searchNote}</p>}{dueOnly && hasMore && <p className={styles.note}>{tableCopy.dueOnlyNote}</p>}
    </>}
    <Dialog open={feeFor !== null} onOpenChange={open => { if (!open) setFeeFor(null) }}>{feeFor && <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogTitle>{tableCopy.addFeeFor(feeFor.name)}</DialogTitle><ChargeEditor key={feeFor.id} studentId={feeFor.id as Id<'students'>} /></DialogContent>}</Dialog>
    {(hasMore || loadingMore) && <Button type="button" variant="outline" disabled={loading || loadingMore} onClick={onMore}>{loadingMore ? copy.loadingMore : copy.more}</Button>}
  </section>
}
