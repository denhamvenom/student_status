import { userFacingError } from '@/lib/error-message'
import { Component, useRef, useState, type ReactNode } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import type { Id } from '../convex/_generated/dataModel'
import { api } from '../convex/_generated/api'
import { Button } from './components/ui/button'
import { CoachFinanceTable } from './CoachFinanceTable'
import { FinanceRecentChanges } from './FinanceRecentChanges'
import { financeWorkspaceCopy as copy } from './lib/finance-admin-copy'
import styles from './CoachFinanceTable.module.css'

class FinanceSectionBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { error: unknown }> {
  state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown) { return { error } }
  render() {
    return this.state.error !== null ? <section className={styles.root}><p role="alert">{userFacingError(this.state.error, copy.unavailable, false)}</p><Button type="button" variant="outline" onClick={this.props.onRetry}>{copy.retry}</Button></section> : this.props.children
  }
}
function RecoverableSection({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0)
  return <FinanceSectionBoundary key={attempt} onRetry={() => setAttempt(value => value + 1)}>{children}</FinanceSectionBoundary>
}
function Accounts({ onOpen, onRecord }: { onOpen: (id: string, name: string) => void; onRecord: (id: string, name: string) => void }) {
  const page = usePaginatedQuery(api.financeAdmin.students, {}, { initialNumItems: 20 })
  const status = useQuery(api.financeAdmin.status, {})
  const rebuild = useMutation(api.financialSources.rebuild)
  const pending = useRef(false)
  const [rebuildingId, setRebuildingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  async function prepareAccount(id: string) {
    const row = page.results.find(item => item.studentId === id)
    if (pending.current || !row?.canRebuild || row.state === 'ready') return
    pending.current = true; setRebuildingId(id); setError(''); setSaved(false)
    try { await rebuild({ studentId: row.studentId as Id<'students'> }); setSaved(true) }
    catch (error) { setError(userFacingError(error, copy.failed)) }
    finally { pending.current = false; setRebuildingId(null) }
  }
  return <section className={styles.root}>
    {status?.maintenance && status.maintenance.state !== 'ready' && <p role={status.maintenance.state === 'failed' ? 'alert' : 'status'}>{status.maintenance.state === 'failed' ? copy.maintenanceFailed : copy.maintenance}</p>}
    <CoachFinanceTable rows={page.results} loading={page.status === 'LoadingFirstPage'} loadingMore={page.status === 'LoadingMore'} hasMore={page.status === 'CanLoadMore'} onMore={() => page.loadMore(20)} onOpen={onOpen} onRecord={onRecord} onRebuild={id => void prepareAccount(id)} rebuildingId={rebuildingId}/>
    {error && <p role="alert">{error}</p>}{saved && <p role="status">{copy.accountRequested}</p>}
  </section>
}
export function CoachFinanceAccounts(props: { onOpen: (id: string, name: string) => void; onRecord: (id: string, name: string) => void }) {
  return <RecoverableSection><Accounts {...props}/></RecoverableSection>
}
function Changes() {
  const page = usePaginatedQuery(api.financeAdmin.recentChanges, {}, { initialNumItems: 20 })
  const status = useQuery(api.financeAdmin.status, {})
  const prepare = useMutation(api.financeChangeBackfill.start)
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  async function start() {
    if (pending.current || !status?.canPrepareHistory) return
    pending.current = true; setBusy(true); setError(''); setSaved(false)
    try { await prepare({}); setSaved(true) }
    catch (error) { setError(userFacingError(error, copy.failed)) }
    finally { pending.current = false; setBusy(false) }
  }
  return <section className={styles.root}>
    <FinanceRecentChanges rows={page.results} loading={page.status === 'LoadingFirstPage'} loadingMore={page.status === 'LoadingMore'} hasMore={page.status === 'CanLoadMore'} coverage={status?.coverage ?? null} onMore={() => page.loadMore(20)}/>
    {status?.canPrepareHistory && <details><summary>More options</summary><Button type="button" variant="outline" disabled={busy} onClick={() => void start()}>{busy ? copy.preparingHistory : copy.prepareHistory}</Button></details>}
    {error && <p role="alert">{error}</p>}{saved && <p role="status">{copy.preparationStarted}</p>}
  </section>
}
export function CoachFinanceChanges() {
  return <RecoverableSection><Changes/></RecoverableSection>
}
