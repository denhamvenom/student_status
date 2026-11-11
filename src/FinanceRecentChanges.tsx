import { Button } from './components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './components/ui/table'
import { financeChangesCopy as copy } from './lib/finance-admin-copy'
import { chargeCurrency } from './lib/charge-money'
import styles from './CoachFinanceTable.module.css'

export type FinanceChangeRow = {
  changeId: string; feeLabel?: string | null; studentName: string | null; actorName: string; occurredAt: number
  kind: string; state: 'committed' | 'progress'; meaning: 'receipt' | 'obligation' | 'applied' | 'personalAvailable' | 'fundraisingAvailable' | 'grossRaised' | 'priority'
  beforeCents: number | null; afterCents: number | null; deltaCents: number | null; reason: string
  sourceKind: 'payment' | 'fundraiser' | null; historical: boolean
  /** Plain words about what changed besides the amount, such as "Method: Check → Cash". */
  detail?: string | null
}
function value(row: FinanceChangeRow, amount: number | null) {
  if (amount === null || !Number.isSafeInteger(amount)) return copy.unavailable
  return row.meaning === 'priority' ? String(amount) : chargeCurrency(amount)
}
function Change({ row }: { row: FinanceChangeRow }) {
  return <><strong>{Object.hasOwn(copy.kinds, row.kind) ? copy.kinds[row.kind as keyof typeof copy.kinds] : copy.other}</strong><span className={styles.note}>{copy.meanings[row.meaning]}{row.sourceKind ? ` - ${copy.sources[row.sourceKind]}` : ''}</span>{row.state === 'progress' && <span className={styles.note}>{copy.progress}</span>}{row.historical && <span className={styles.note}>{copy.historical}</span>}</>
}
/** The server's stand-in text when no reason was written; people see "No reason given". */
export const changeReason = (reason: string) => !reason.trim() || reason === 'Money change recorded' ? copy.noReason : reason
/** Direction and size of an amount change, from before and after when both are known (a saved change size can be unsigned). */
export function amountChange(row: Pick<FinanceChangeRow, 'meaning' | 'beforeCents' | 'afterCents' | 'deltaCents'>): { text: string; label: string } | null {
  if (row.meaning === 'priority') return null
  const known = row.beforeCents !== null && row.afterCents !== null && Number.isSafeInteger(row.beforeCents) && Number.isSafeInteger(row.afterCents)
  const delta = known ? row.afterCents! - row.beforeCents! : row.deltaCents
  if (delta === null || !Number.isSafeInteger(delta)) return null
  if (delta === 0) return { text: copy.unchanged, label: copy.change }
  const size = chargeCurrency(Math.abs(delta))
  return delta < 0 ? { text: `${copy.lowered(size)} (${copy.minus(size)})`, label: copy.change } : { text: copy.raised(size), label: copy.change }
}
function Amounts({ row }: { row: FinanceChangeRow }) {
  const change = amountChange(row)
  const same = row.beforeCents !== null && row.beforeCents === row.afterCents && row.meaning !== 'priority'
  return <>{same ? <span>{value(row, row.afterCents)}</span> : <>{value(row,row.beforeCents)} → {value(row,row.afterCents)}</>}{row.detail && <span className={styles.note}>{row.detail}</span>}{change && !(same && row.detail) && <span className={styles.note}>{change.label}: {change.text}</span>}</>
}
const when = (at: number) => new Intl.DateTimeFormat('en-US', { timeZone:'America/Chicago', dateStyle:'medium', timeStyle:'short' }).format(at)
export function FinanceRecentChanges({ rows, loading, loadingMore, hasMore, coverage, onMore }: {
  rows: FinanceChangeRow[]; loading: boolean; loadingMore: boolean; hasMore: boolean
  coverage: { state: 'updating' | 'ready' | 'failed'; startedAt: number | null; completedAt: number | null } | null; onMore: () => void
}) {
  return <section className={styles.root} aria-label={copy.title}><h2>{copy.title}</h2><p className={styles.note}>{copy.coverageNote}</p>{coverage && <div role={coverage.state === 'failed' ? 'alert' : 'status'}><p>{copy.coverage[coverage.state]}</p>{coverage.startedAt !== null && <p className={styles.note}>{copy.coverageStarted}: {when(coverage.startedAt)}</p>}{coverage.completedAt !== null && <p className={styles.note}>{copy.coverageCompleted}: {when(coverage.completedAt)}</p>}</div>}
    {loading ? <p role="status">{copy.loading}</p> : rows.length === 0 ? <p>{hasMore || loadingMore ? copy.continuing : copy.empty}</p> : <>
      <div className={styles.desktop}><Table><TableHeader><TableRow>{[copy.when,copy.student,copy.change,copy.amounts,copy.actor].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.changeId}><TableCell>{when(row.occurredAt)}</TableCell><TableCell>{row.studentName ?? copy.team}{row.feeLabel && <span className={styles.note}>{row.feeLabel}</span>}</TableCell><TableCell><Change row={row}/></TableCell><TableCell><Amounts row={row}/></TableCell><TableCell>{row.actorName}<span className={styles.note}>{changeReason(row.reason)}</span></TableCell></TableRow>)}</TableBody></Table></div>
      <div className={styles.mobile}>{rows.map(row => <article className={styles.account} key={row.changeId}><h3>{row.studentName ?? copy.team}{row.feeLabel && <span className={styles.note}>{row.feeLabel}</span>}</h3><span className={styles.note}>{when(row.occurredAt)}</span><div><Change row={row}/></div><div><Amounts row={row}/></div><p className={styles.note}>{row.actorName} · {changeReason(row.reason)}</p></article>)}</div>
    </>}
    {(hasMore || loadingMore) && <Button type="button" variant="outline" disabled={loading || loadingMore} onClick={onMore}>{loadingMore ? copy.loading : copy.more}</Button>}
  </section>
}
