import { Component, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useConvex, useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Radio } from '@base-ui/react/radio'
import { Card, CardTitle } from './components/ui/card'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { fundraisingCopy as copy } from './lib/fundraising-copy'
import styles from './Fundraising.module.css'

/** Parse cents or basis points without floating point rounding. */
export function parseFundraisingDecimal(text: string): number | null {
  const value = text.trim()
  if (value.length > 128 || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const scaled = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  return scaled <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(scaled) : null
}

type AllocationMode = 'team' | 'student' | 'split'
type CreateInput = { name: string; teamBps: number; studentBps: number }

export function FundraiserCreationForm({ pending, onCreate }: {
  pending: boolean
  onCreate: (input: CreateInput) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<AllocationMode>('split')
  const [team, setTeam] = useState('')
  const [student, setStudent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const teamBps = mode === 'team' ? 10000 : mode === 'student' ? 0 : parseFundraisingDecimal(team)
  const studentBps = mode === 'student' ? 10000 : mode === 'team' ? 0 : parseFundraisingDecimal(student)
  const valid = teamBps !== null && studentBps !== null && teamBps <= 10000 && studentBps <= 10000 && teamBps + studentBps === 10000
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || teamBps === null || studentBps === null || !name.trim()) return
    setError(null)
    try {
      await onCreate({ name: name.trim(), teamBps, studentBps })
      setName('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : copy.failed)
    }
  }
  return <Card className={styles.card}>
    <CardTitle>{copy.newFundraiser}</CardTitle>
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>{copy.name}<Input value={name} onChange={event => setName(event.target.value)} required maxLength={150} disabled={pending} /></label>
      <span className={styles.field}>{copy.allocation}</span>
      <RadioGroup className={styles.choices} value={mode} onValueChange={value => setMode(value as AllocationMode)} disabled={pending} aria-label={copy.allocation}>
        {([['team', copy.teamOnly], ['student', copy.studentOnly], ['split', copy.split]] as const).map(([value, label]) => <label key={value}><Radio.Root className={styles.radio} value={value}><Radio.Indicator className={styles.radioDot} /></Radio.Root>{label}</label>)}
      </RadioGroup>
      {mode === 'split' && <div className={styles.percentages}>
        <label className={styles.field}>{copy.teamPercent}<Input inputMode="decimal" value={team} onChange={event => setTeam(event.target.value)} disabled={pending} /></label>
        <label className={styles.field}>{copy.studentPercent}<Input inputMode="decimal" value={student} onChange={event => setStudent(event.target.value)} disabled={pending} /></label>
      </div>}
      {mode === 'split' && <p className={styles.muted}>Total: {teamBps !== null && studentBps !== null && teamBps <= 10000 && studentBps <= 10000 ? `${(teamBps + studentBps) / 100}%` : '—'}</p>}
      {mode === 'split' && (team || student) && !valid && <p className={styles.error}>{copy.percentageError}</p>}
      <p className={styles.muted}>{copy.rounding}</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <Button type="submit" disabled={pending || !valid || !name.trim()}>{pending ? 'Creating…' : copy.create}</Button>
    </form>
  </Card>
}

export function formatFundraisingCents(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error('An exact-cent amount is required.')
  const exact = BigInt(value)
  const absolute = exact < 0n ? -exact : exact
  return `${exact < 0n ? '-' : ''}$${new Intl.NumberFormat('en-US').format(absolute / 100n)}.${String(absolute % 100n).padStart(2, '0')}`
}
export function fundraisingDecimalValue(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('A nonnegative exact-cent amount is required.')
  const exact = BigInt(value)
  return `${exact / 100n}.${String(exact % 100n).padStart(2, '0')}`
}
const usd = formatFundraisingCents
const percentage = (value: number) => `${value / 100}%`
const fundraiserStatuses: Record<string,string> = { draft: 'Draft', posting: 'Posting in progress', posted: 'Posted', held: 'Some amounts need Coach review', failed: 'Posting stopped; a Coach needs to review it', closed: 'Closed' }
const postingStatuses: Record<string,string> = { running: 'In progress', held: 'Some amounts need Coach review', failed: 'Posting stopped; a Coach needs to review it', complete: 'Complete' }
const postedRowStatuses: Record<string,string> = { pending: 'Not yet posted', committed: 'Posted', held: 'Needs Coach review', failed: 'Posting stopped' }
const revisionStatuses: Record<string,string> = { committed: 'Posted', processing: 'Posting in progress', held: 'Needs Coach review', failed: 'Posting stopped' }
const fundraiserStatus = (state: string) => fundraiserStatuses[state] ?? 'Status unavailable'
const postingStatus = (state: string) => postingStatuses[state] ?? 'Status unavailable'
const postedRowStatus = (state: string) => postedRowStatuses[state] ?? 'Status unavailable'
const revisionStatus = (state: string) => revisionStatuses[state] ?? 'Status unavailable'

export function Fundraising() {
  const [attempt, setAttempt] = useState(0)
  return <FundraisingBoundary key={attempt} retry={() => setAttempt(value => value + 1)}><FundraisingContent /></FundraisingBoundary>
}

class FundraisingBoundary extends Component<{ children: ReactNode; retry: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <section className={styles.root}><div className="page-head"><h1>{copy.title}</h1></div><p role="alert" className={styles.error}>{copy.failed}</p><Button variant="outline" onClick={this.props.retry}>Try again</Button></section> : this.props.children
  }
}

function FundraisingContent() {
  const list = usePaginatedQuery(api.fundraisers.list, {}, { initialNumItems: 20 })
  const create = useMutation(api.fundraisers.create)
  const [selected, setSelected] = useState<Id<'fundraisers'> | null>(null)
  const [creating, setCreating] = useState(false)
  const createIntent = useRef<{ fingerprint: string; key: string } | null>(null)
  const activeId = selected ?? list.results[0]?._id ?? null
  const capabilities = useQuery(api.fundraisers.workspace, activeId ? { fundraiserId: activeId } : 'skip')?.capabilities
  // A first-page query also provides grants when the season has no fundraisers.
  const firstPage = useQuery(api.fundraisers.list, { paginationOpts: { cursor: null, numItems: 1 } })
  const availableCapabilities = capabilities ?? firstPage?.capabilities
  async function createFundraiser(input: CreateInput) {
    const fingerprint = JSON.stringify(input)
    if (createIntent.current?.fingerprint !== fingerprint) createIntent.current = { fingerprint, key: crypto.randomUUID() }
    setCreating(true)
    try {
      const fundraiserId = await create({ ...input, idempotencyKey: createIntent.current.key })
      setSelected(fundraiserId)
      createIntent.current = null
    } finally { setCreating(false) }
  }
  return <section className={styles.root}>
    <div className="page-head"><h1>{copy.title}</h1><p className={styles.muted}>{availableCapabilities ? availableCapabilities.canPost ? copy.subtitle : 'Review how fundraiser proceeds support the team and student travel. Amounts are view only for your account.' : 'Review how fundraiser proceeds support the team and student travel.'}</p></div>
    {list.status === 'LoadingFirstPage' ? <p>{copy.loading}</p> : list.results.length === 0 ? <p className={styles.notice}>{copy.noFundraisers}</p> : <div className={styles.selection}>
      {list.results.map(row => <FundraiserSelectionCard key={row._id} fundraiser={row} selected={activeId === row._id} choose={() => setSelected(row._id)} />)}
    </div>}
    {list.status === 'CanLoadMore' && <Button variant="outline" onClick={() => list.loadMore(20)}>{copy.loadMore}</Button>}
    {list.status === 'LoadingMore' && <p role="status">{copy.loading}</p>}
    <div className={styles.columns}>
      {activeId && <FundraiserWorkspace key={activeId} fundraiserId={activeId} />}
      {(capabilities ?? firstPage?.capabilities)?.canCreate && <FundraiserCreationForm pending={creating} onCreate={createFundraiser} />}
    </div>
  </section>
}

function FundraiserSelectionCard({ fundraiser, selected, choose }: { fundraiser: FunctionReturnType<typeof api.fundraisers.list>['page'][number]; selected: boolean; choose: () => void }) {
  const data = useQuery(api.fundraisers.workspace, { fundraiserId: fundraiser._id })
  return <button type="button" className={styles.selectCard} aria-pressed={selected} onClick={choose}><strong>{fundraiser.name}</strong><span className={styles.muted}>Team {percentage(fundraiser.teamBps)} · Student travel {percentage(fundraiser.studentBps)}</span>{data ? <span className={styles.muted}>Recorded raised {usd(data.totals.grossCents)} · Team {usd(data.totals.teamCents)} · Student credit {usd(data.totals.travelCreditCents)}</span> : <span className={styles.muted}>{copy.loading}</span>}<span className={styles.status}>{fundraiserStatus(fundraiser.state)}</span></button>
}

function FundraiserWorkspace({ fundraiserId }: { fundraiserId: Id<'fundraisers'> }) {
  const workspace = useQuery(api.fundraisers.workspace, { fundraiserId })
  const students = usePaginatedQuery(api.fundraisers.students, { fundraiserId }, { initialNumItems: 20 })
  const client = useConvex()
  const post = useMutation(api.fundraisers.post)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [reviewed, setReviewed] = useState<AmountPreview | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [historyStudent, setHistoryStudent] = useState<Id<'students'> | null>(null)
  const pendingIntent = useRef<{ fingerprint: string; key: string } | null>(null)
  const busyGuard = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  if (!workspace) return <Card className={styles.card}><p>{copy.loading}</p></Card>
  const editable = workspace.capabilities.canPost && !['posting', 'failed', 'held', 'closed'].includes(workspace.fundraiser.state)
  const inputs = Object.entries(drafts).map(([studentId, value]) => ({ studentId: studentId as Id<'students'>, grossCents: parseFundraisingDecimal(value) }))
  const valid = inputs.length > 0 && inputs.length <= 500 && inputs.every(row => row.grossCents !== null)
  const ready = reviewed && reviewed.fundraiserRevision === workspace.fundraiser.revision && reviewed.rows.length > 0 && reviewed.rows.every(row => {
    const current = students.results.find(student => student.studentId === row.studentId)
    return row.state === 'ready' && row.expectedFinancialRevision !== null && current?.financialState === 'ready' && current.financialRevision === row.expectedFinancialRevision && current.rowRevision === row.expectedRowRevision
  })
  function changed(studentId: Id<'students'>, value: string) {
    setDrafts(previous => ({ ...previous, [studentId]: value }))
    setReviewed(null); pendingIntent.current = null; setError('')
  }
  async function review() {
    if (!workspace || !valid || busyGuard.current) return
    busyGuard.current = true; setBusy(true); setError(''); setReviewed(null)
    try {
      const preview = await collectFundraisingPreview(args => client.query(api.fundraisers.preview, args), { fundraiserId, expectedRevision: workspace.fundraiser.revision, rows: inputs.map(row => ({ studentId: row.studentId, grossCents: row.grossCents! })) }, () => !mounted.current)
      if (mounted.current) setReviewed(preview)
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : copy.failed) }
    finally { busyGuard.current = false; if (mounted.current) setBusy(false) }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!workspace || !reviewed || !ready || reason.trim().length < 8 || busyGuard.current) return
    const command: FunctionArgs<typeof api.fundraisers.post> = { fundraiserId, expectedRevision: reviewed.fundraiserRevision, rows: reviewed.rows.map(row => ({ studentId: row.studentId, grossCents: row.grossCents, expectedRowRevision: row.expectedRowRevision, expectedFinancialRevision: row.expectedFinancialRevision! })), reason: reason.trim(), idempotencyKey: '' }
    const fingerprint = JSON.stringify(command)
    if (pendingIntent.current?.fingerprint !== fingerprint) pendingIntent.current = { fingerprint, key: crypto.randomUUID() }
    command.idempotencyKey = pendingIntent.current.key
    busyGuard.current = true; setBusy(true); setError('')
    try { await post(command); setDrafts({}); setReviewed(null); setReason(''); pendingIntent.current = null }
    catch (cause) { setError(cause instanceof Error ? cause.message : copy.failed) }
    finally { busyGuard.current = false; setBusy(false) }
  }
  const input = (row: (typeof students.results)[number]) => editable ? <Input aria-label={`${row.name} · ${copy.raised}`} inputMode="decimal" maxLength={24} value={drafts[row.studentId] ?? fundraisingDecimalValue(row.grossCents)} disabled={busy || row.financialState !== 'ready'} onChange={event => changed(row.studentId, event.target.value)} aria-invalid={drafts[row.studentId] !== undefined && parseFundraisingDecimal(drafts[row.studentId]) === null} /> : <span>{usd(row.grossCents)}</span>
  return <div className={styles.form}>
    <Card className={`${styles.card} ${styles.amountsCard}`}>
      <div className={styles.amountsHead}><CardTitle>{workspace.fundraiser.name} · {copy.amounts}</CardTitle><p className={styles.muted}>Team {percentage(workspace.fundraiser.teamBps)} · Student travel {percentage(workspace.fundraiser.studentBps)}</p><dl className={styles.details}><dt>{copy.committedRaised}</dt><dd>{usd(workspace.totals.grossCents)}</dd><dt>{copy.team}</dt><dd>{usd(workspace.totals.teamCents)}</dd><dt>{copy.travelCredit}</dt><dd>{usd(workspace.totals.travelCreditCents)}</dd></dl><p className={styles.muted}>The amounts below are recorded totals. Edited amounts take effect after review and posting.</p></div>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>{copy.student}</th><th>{copy.raised}</th><th>{copy.team}</th><th>{copy.travelCredit}</th></tr></thead><tbody>{students.results.map(row => <tr key={row.studentId}><td>{row.name}{row.financialState === 'updating' && <p className={styles.muted}>{copy.financialUpdating}</p>}<Button variant="ghost" onClick={() => setHistoryStudent(row.studentId)}>{copy.history}</Button></td><td>{input(row)}</td><td>{usd(row.teamCents)}</td><td>{usd(row.travelCreditCents)}</td></tr>)}</tbody></table></div>
      <div className={styles.mobileRows}>{students.results.map(row => <div className={styles.studentCard} key={row.studentId}><strong>{row.name}</strong><label className={styles.field}>{copy.raised}{input(row)}</label><div className={styles.shares}><span>{copy.team} {usd(row.teamCents)}</span><span>{copy.travelCredit} {usd(row.travelCreditCents)}</span></div>{row.financialState === 'updating' && <p className={styles.muted}>{copy.financialUpdating}</p>}<Button variant="ghost" onClick={() => setHistoryStudent(row.studentId)}>{copy.history}</Button></div>)}</div>
      <div className={styles.actions}>{students.status === 'CanLoadMore' && <Button variant="outline" disabled={busy} onClick={() => students.loadMore(20)}>{copy.loadMore}</Button>}{(students.status === 'LoadingMore' || students.status === 'LoadingFirstPage') && <p role="status">{copy.loading}</p>}{students.status === 'Exhausted' && students.results.length === 0 && <p>{copy.noStudents}</p>}{editable && <><Button disabled={busy || !valid} onClick={() => void review()}>{busy ? 'Reviewing…' : copy.preview}</Button><Button variant="outline" disabled={busy || inputs.length === 0} onClick={() => { setDrafts({}); setReviewed(null); pendingIntent.current = null }}>{copy.discard}</Button></>}{inputs.length > 500 && <p className={styles.error}>Review at most 500 student amounts in one posting.</p>}</div>
    </Card>
    {reviewed && <Card className={styles.card}><CardTitle>{copy.exactPreview}</CardTitle><p className={styles.muted}>{copy.rounding}</p>{reviewed.rows.map(row => <div className={styles.studentCard} key={row.studentId}><strong>{students.results.find(student => student.studentId === row.studentId)?.name}</strong><dl className={styles.details}><dt>Gross raised after posting</dt><dd>{usd(row.grossCents)}</dd><dt>{copy.team}</dt><dd>{usd(row.teamCents)}</dd><dt>{copy.travelCredit}</dt><dd>{usd(row.travelCreditCents)}</dd><dt>Gross change</dt><dd>{usd(row.grossDeltaCents)}</dd><dt>Team change</dt><dd>{usd(row.teamDeltaCents)}</dd><dt>Travel credit change</dt><dd>{usd(row.travelDeltaCents)}</dd></dl>{row.state !== 'ready' && <p className={styles.notice}>{row.message ?? (row.state === 'hold' ? copy.spentHold : copy.updating)}</p>}</div>)}{!ready && <p className={styles.notice}>All edited rows must be ready before posting. Resolve rows on hold or discard and review a smaller set.</p>}<form className={styles.form} onSubmit={submit}><label className={styles.field}>{copy.reason} (at least 8 characters)<Input value={reason} disabled={busy} onChange={event => { setReason(event.target.value); pendingIntent.current = null }} minLength={8} maxLength={1000} required /></label><p className={styles.muted}>{copy.noPayment}</p><Button type="submit" disabled={busy || !ready || reason.trim().length < 8}>{busy ? 'Submitting…' : copy.post}</Button></form></Card>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {workspace.job && <FundraiserPosting key={workspace.job._id} job={workspace.job} coach={workspace.capabilities.canChangePolicy} />}
    <FundraiserJobHistory fundraiserId={fundraiserId} currentJobId={workspace.job?._id ?? null} />
    {workspace.capabilities.canChangePolicy && <FundraiserPolicy key={`${fundraiserId}:${workspace.fundraiser.revision}`} workspace={workspace} />}
    {historyStudent && <FundraiserHistory key={historyStudent} fundraiserId={fundraiserId} studentId={historyStudent} name={students.results.find(row => row.studentId === historyStudent)?.name ?? ''} close={() => setHistoryStudent(null)} />}
  </div>
}

type AmountPreview = FunctionReturnType<typeof api.fundraisers.preview>
export async function collectFundraisingPreview(fetchPage: (args: FunctionArgs<typeof api.fundraisers.preview>) => Promise<AmountPreview>, input: FunctionArgs<typeof api.fundraisers.preview>, cancelled: () => boolean = () => false): Promise<AmountPreview> {
  if (!input.rows.length || input.rows.length > 500 || new Set(input.rows.map(row => row.studentId)).size !== input.rows.length) throw new Error('Review between one and 500 unique student amounts.')
  const rows: AmountPreview['rows'] = []
  for (let index = 0; index < input.rows.length; index += 20) {
    if (cancelled()) throw new Error('Preview cancelled.')
    const requested = input.rows.slice(index, index + 20)
    const page = await fetchPage({ ...input, rows: requested })
    if (page.fundraiserRevision !== input.expectedRevision || page.rows.length !== requested.length || new Set(page.rows.map(row => row.studentId)).size !== requested.length || requested.some(row => !page.rows.some(result => result.studentId === row.studentId && result.grossCents === row.grossCents))) throw new Error('The preview changed. Review the amounts again.')
    rows.push(...page.rows)
  }
  if (cancelled()) throw new Error('Preview cancelled.')
  return { fundraiserRevision: input.expectedRevision, rows }
}

function FundraiserHistory({ fundraiserId, studentId, name, close }: { fundraiserId: Id<'fundraisers'>; studentId: Id<'students'>; name: string; close: () => void }) {
  const history = usePaginatedQuery(api.fundraisers.history, { fundraiserId, studentId }, { initialNumItems: 20 })
  return <Card className={styles.card}><CardTitle>{name} · {copy.history}</CardTitle>{history.results.map(row => <div key={row._id} className={styles.historyRow}><strong>{new Date(row.recordedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })} · {revisionStatus(row.recordState)}</strong>{row.recordState !== 'committed' && <p className={styles.notice}>Planned amounts. Fundraiser totals do not include this change yet.</p>}<p>Gross {usd(row.previousGrossCents)} → {usd(row.grossCents)} · Team {usd(row.previousTeamCents)} → {usd(row.teamCents)} · Travel credit {usd(row.previousTravelCreditCents)} → {usd(row.travelCreditCents)}</p><p>{row.reason}</p></div>)}{history.status === 'Exhausted' && history.results.length === 0 && <p>{copy.noHistory}</p>}{history.status === 'CanLoadMore' && <Button variant="outline" onClick={() => history.loadMore(20)}>{copy.loadMore}</Button>}{['LoadingFirstPage', 'LoadingMore'].includes(history.status) && <p>{copy.loading}</p>}<Button variant="outline" onClick={close}>Close history</Button></Card>
}

function FundraiserJobHistory({ fundraiserId, currentJobId }: { fundraiserId: Id<'fundraisers'>; currentJobId: Id<'fundraiserPostingJobs'> | null }) {
  const history = usePaginatedQuery(api.fundraisers.jobs, { fundraiserId }, { initialNumItems: 20 })
  const [selectedId, setSelectedId] = useState<Id<'fundraiserPostingJobs'> | null>(null)
  const selected = history.results.find(row => row._id === selectedId)
  return <Card className={styles.card}><CardTitle>{copy.postingHistory}</CardTitle>{history.results.map(row => <button type="button" className={styles.selectCard} key={row._id} aria-pressed={selectedId === row._id} onClick={() => setSelectedId(selectedId === row._id ? null : row._id)}><span>Started {new Date(row.createdAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })} · Processing actor: {row.actorName}</span><span>{postingStatus(row.state)} · {row.committed} saved · {row.held} need review</span><span className={styles.muted}>{row.reason}</span></button>)}{history.status === 'Exhausted' && history.results.length === 0 && <p>{copy.noHistory}</p>}{history.status === 'CanLoadMore' && <Button variant="outline" onClick={() => history.loadMore(20)}>{copy.loadMore}</Button>}{['LoadingFirstPage', 'LoadingMore'].includes(history.status) && <p>{copy.loading}</p>}{selected && selected._id !== currentJobId && <FundraiserPosting key={selected._id} job={selected} coach={false} />}{selected && selected._id === currentJobId && <p className={styles.muted}>The current posting and available retry controls are shown above.</p>}</Card>
}

function FundraiserPolicy({ workspace }: { workspace: FunctionReturnType<typeof api.fundraisers.workspace> }) {
  const changePolicy = useMutation(api.fundraisers.updatePolicy)
  const close = useMutation(api.fundraisers.close)
  const [team, setTeam] = useState(String(workspace.fundraiser.teamBps / 100))
  const [student, setStudent] = useState(String(workspace.fundraiser.studentBps / 100))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const teamBps = parseFundraisingDecimal(team); const studentBps = parseFundraisingDecimal(student)
  const valid = teamBps !== null && studentBps !== null && teamBps + studentBps === 10000
  const allowed = !['posting', 'failed', 'held', 'closed'].includes(workspace.fundraiser.state)
  async function submit(kind: 'split' | 'close') {
    if (busy || reason.trim().length < 8 || !allowed) return
    setBusy(true); setError('')
    try {
      const args = { fundraiserId: workspace.fundraiser._id, expectedRevision: workspace.fundraiser.revision, reason: reason.trim() }
      if (kind === 'split' && valid && teamBps !== null && studentBps !== null) await changePolicy({ ...args, teamBps, studentBps })
      else if (kind === 'close') await close(args)
    } catch (cause) { setError(cause instanceof Error ? cause.message : copy.failed) }
    finally { setBusy(false) }
  }
  if (!allowed) return <p className={styles.muted}>{workspace.fundraiser.state === 'closed' ? 'This fundraiser is closed.' : 'Resolve unfinished posting before changing or closing this fundraiser.'}</p>
  return <Card className={styles.card}><CardTitle>{copy.coachControls}</CardTitle>{workspace.fundraiser.state === 'draft' ? <div className={styles.percentages}><label className={styles.field}>{copy.teamPercent}<Input inputMode="decimal" value={team} disabled={busy} onChange={event => setTeam(event.target.value)} /></label><label className={styles.field}>{copy.studentPercent}<Input inputMode="decimal" value={student} disabled={busy} onChange={event => setStudent(event.target.value)} /></label></div> : <p className={styles.muted}>{copy.policyLocked}</p>}<label className={styles.field}>Reason for split change or closure<Input value={reason} disabled={busy} onChange={event => setReason(event.target.value)} minLength={8} maxLength={1000} /></label><div className={styles.actions}>{workspace.fundraiser.state === 'draft' && <Button variant="outline" disabled={busy || !valid || reason.trim().length < 8} onClick={() => void submit('split')}>{copy.saveAllocation}</Button>}<Button variant="outline" disabled={busy || reason.trim().length < 8} onClick={() => void submit('close')}>{copy.closeFundraiser}</Button></div>{error && <p className={styles.error} role="alert">{error}</p>}</Card>
}

function FundraiserPosting({ job, coach }: { job: NonNullable<FunctionReturnType<typeof api.fundraisers.workspace>['job']>; coach: boolean }) {
  const rows = usePaginatedQuery(api.fundraiserPosting.rows, { jobId: job._id }, { initialNumItems: 20 })
  const retry = useMutation(api.fundraiserPosting.retry)
  const client = useConvex()
  const [reviewed, setReviewed] = useState<FunctionReturnType<typeof api.fundraiserPosting.retryPreview>>([])
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const retryReady = reviewed.length > 0 && reviewed.every(row => row.state === 'ready' && row.expectedFinancialRevision !== null)
  async function reviewRow(studentId: Id<'students'>) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await client.query(api.fundraiserPosting.retryPreview, { jobId: job._id, studentIds: [studentId] })
      if (result.length !== 1 || result[0].studentId !== studentId) throw new Error('The retry preview changed. Review this row again.')
      setReviewed(previous => [...previous.filter(row => row.studentId !== studentId), ...result])
    } catch (cause) { setError(cause instanceof Error ? cause.message : copy.failed) }
    finally { setBusy(false) }
  }
  return <Card className={styles.card}><CardTitle>{copy.posting} · {postingStatus(job.state)}</CardTitle><p role="status">{job.committed} saved · {job.held} need review · {job.processed} checked in this pass.</p><p className={styles.muted}>{job.state === 'complete' ? copy.complete : copy.partial}</p>{job.lastError && <p role="alert" className={styles.error}>{job.lastError}</p>}{rows.results.map(row => <div className={styles.historyRow} key={row._id}><strong>{row.name} · {usd(row.grossCents)} · {postedRowStatus(row.state)}</strong>{(row.reversedCents ?? 0)>0&&<p className={styles.notice}>{copy.committedReversal} {usd(row.reversedCents!)}. {copy.reversalTargetPending}</p>}{row.message && <p className={styles.notice}>{row.message}</p>}{coach && ['failed', 'held'].includes(job.state) && row.state === 'held' && !row.pendingRevisionId && <Button variant="outline" disabled={busy} onClick={() => void reviewRow(row.studentId)}>{copy.reviewHeld}</Button>}</div>)}{rows.status === 'CanLoadMore' && <Button variant="outline" onClick={() => rows.loadMore(20)}>{copy.loadMore}</Button>}{['LoadingFirstPage', 'LoadingMore'].includes(rows.status) && <p>{copy.loading}</p>}{reviewed.map(row => <div className={styles.studentCard} key={row.studentId}><strong>{row.name} · Retry preview</strong><dl className={styles.details}><dt>Original reviewed amount raised</dt><dd>{usd(row.grossCents)}</dd><dt>Original travel credit available</dt><dd>{usd(row.availableOriginalCents)}</dd><dt>Required reduction</dt><dd>{usd(row.requiredReductionCents)}</dd></dl><p>{row.message ?? 'This reviewed row is ready for retry.'}</p><Button variant="outline" onClick={() => setReviewed(previous => previous.filter(result => result.studentId !== row.studentId))}>Remove from retry review</Button></div>)}{coach && ['failed', 'held'].includes(job.state) && <form className={styles.form} onSubmit={async event => { event.preventDefault(); if (busy || reason.trim().length < 8 || job.state === 'held' && !retryReady || reviewed.length > 0 && !retryReady) return; setBusy(true); setError(''); try { await retry({ jobId: job._id, reason: reason.trim(), rows: reviewed.map(row => ({ studentId: row.studentId, expectedRowRevision: row.expectedRowRevision, expectedFinancialRevision: row.expectedFinancialRevision! })) }); setReason(''); setReviewed([]) } catch (cause) { setError(cause instanceof Error ? cause.message : copy.failed) } finally { setBusy(false) } }}><label className={styles.field}>Reason for retry (at least 8 characters)<Input value={reason} onChange={event => setReason(event.target.value)} minLength={8} maxLength={1000} disabled={busy} /></label><p className={styles.muted}>{job.state === 'failed' && reviewed.length === 0 ? 'Resume the failed job from its saved progress. Already recorded rows will not be posted again.' : 'Only rows you have reviewed are retried. Other rows needing review stay on hold.'}</p><Button type="submit" disabled={busy || reason.trim().length < 8 || job.state === 'held' && !retryReady || reviewed.length > 0 && !retryReady}>{copy.retry}</Button></form>}{job.state === 'held' && <p className={styles.notice}>{copy.hold} Amounts on hold have not changed. Review each row’s reason before retrying.</p>}{error && <p role="alert" className={styles.error}>{error}</p>}</Card>
}
