import { Button } from './components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './components/ui/table'
import { financeChangesCopy as copy } from './lib/finance-admin-copy'
import { chargeCurrency } from './lib/charge-money'
import styles from './CoachFinanceTable.module.css'

export type FinanceChangeRow = {
  changeId: string; studentName: string | null; actorName: string; occurredAt: number
  kind: string; state: 'committed' | 'progress'; meaning: 'receipt' | 'obligation' | 'applied' | 'personalAvailable' | 'fundraisingAvailable' | 'grossRaised' | 'priority'
  beforeCents: number | null; afterCents: number | null; deltaCents: number | null; reason: string
  sourceKind: 'payment' | 'fundraiser' | null; historical: boolean
}
function value(row: FinanceChangeRow, amount: number | null) {
  if (amount === null || !Number.isSafeInteger(amount)) return copy.unavailable
  return row.meaning === 'priority' ? String(amount) : chargeCurrency(amount)
}
function Change({ row }: { row: FinanceChangeRow }) {
  return <><strong>{Object.hasOwn(copy.kinds, row.kind) ? copy.kinds[row.kind as keyof typeof copy.kinds] : copy.other}</strong><span className={styles.note}>{copy.meanings[row.meaning]}{row.sourceKind ? ` - ${copy.sources[row.sourceKind]}` : ''}</span>{row.state === 'progress' && <span className={styles.note}>{copy.progress}</span>}{row.historical && <span className={styles.note}>{copy.historical}</span>}</>
}
function Amounts({ row }: { row: FinanceChangeRow }) {
  return <>{value(row,row.beforeCents)} → {value(row,row.afterCents)}{row.deltaCents !== null && <span className={styles.note}>{copy.change}: {value(row,row.deltaCents)}</span>}</>
}
const when = (at: number) => new Intl.DateTimeFormat('en-US', { timeZone:'America/Chicago', dateStyle:'medium', timeStyle:'short' }).format(at)
export function FinanceRecentChanges({ rows, loading, loadingMore, hasMore, coverage, onMore }: {
  rows: FinanceChangeRow[]; loading: boolean; loadingMore: boolean; hasMore: boolean
  coverage: { state: 'updating' | 'ready' | 'failed'; startedAt: number | null; completedAt: number | null } | null; onMore: () => void
}) {
  return <section className={styles.root} aria-label={copy.title}><h2>{copy.title}</h2><p className={styles.note}>{copy.coverageNote}</p>{coverage && <div role={coverage.state === 'failed' ? 'alert' : 'status'}><p>{copy.coverage[coverage.state]}</p>{coverage.startedAt !== null && <p className={styles.note}>{copy.coverageStarted}: {when(coverage.startedAt)}</p>}{coverage.completedAt !== null && <p className={styles.note}>{copy.coverageCompleted}: {when(coverage.completedAt)}</p>}</div>}
    {loading ? <p role="status">{copy.loading}</p> : rows.length === 0 ? <p>{hasMore || loadingMore ? copy.continuing : copy.empty}</p> : <>
      <div className={styles.desktop}><Table><TableHeader><TableRow>{[copy.when,copy.student,copy.change,copy.amounts,copy.actor].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.changeId}><TableCell>{when(row.occurredAt)}</TableCell><TableCell>{row.studentName ?? copy.team}</TableCell><TableCell><Change row={row}/></TableCell><TableCell><Amounts row={row}/></TableCell><TableCell>{row.actorName}<span className={styles.note}>{row.reason}</span></TableCell></TableRow>)}</TableBody></Table></div>
      <div className={styles.mobile}>{rows.map(row => <article className={styles.account} key={row.changeId}><h3>{row.studentName ?? copy.team}</h3><span className={styles.note}>{when(row.occurredAt)}</span><div><Change row={row}/></div><div><Amounts row={row}/></div><p className={styles.note}>{row.actorName} · {row.reason}</p></article>)}</div>
    </>}
    {(hasMore || loadingMore) && <Button type="button" variant="outline" disabled={loading || loadingMore} onClick={onMore}>{loadingMore ? copy.loading : copy.more}</Button>}
  </section>
}
