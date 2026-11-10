import { userFacingError } from '@/lib/error-message'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ConfirmAction } from '../../ConfirmAction'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { announcementsCopy as copy } from './copy'
import { AnnouncementWizard } from './AnnouncementWizard'
import { anyHomeFull, coachOnly, hasPinRoom } from './audience'

type StaffAnnouncement = FunctionReturnType<typeof api.announcements.listForStaff>['pinned'][number]
type AnnouncementId = Id<'teamAnnouncements'>
type ListName = 'pinned' | 'notPinned'

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Chicago' })
const formatDate = (at: number) => dateFormat.format(at)
const shortLabel = (row: StaffAnnouncement) => row.title ?? (row.body.length > 60 ? `${row.body.slice(0, 57).trimEnd()}…` : row.body)

function AnnouncementItem({ row, list, pinned, pinLimit, coach, editing, setEditing, onLeaving, onDone }: {
  row: StaffAnnouncement
  list: ListName
  pinned: StaffAnnouncement[]
  pinLimit: number
  coach: boolean
  editing: boolean
  setEditing: (editing: boolean) => void
  /** Called before a change that moves the message out of this list, so focus can follow. */
  onLeaving: (id: AnnouncementId | null, list: ListName) => void
  onDone: (message: string) => void
}) {
  const update = useMutation(api.announcements.update)
  const pin = useMutation(api.announcements.pin)
  const unpin = useMutation(api.announcements.unpin)
  const archive = useMutation(api.announcements.archive)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const editButton = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(editing)
  useEffect(() => { if (wasEditing.current && !editing) editButton.current?.focus(); wasEditing.current = editing }, [editing])
  // The browser decides whether the Show until date has passed; queries cannot read the clock.
  const [now] = useState(() => Date.now())
  const expired = row.showUntil !== null && row.showUntil <= now

  async function move(action: () => Promise<null>, message: string) {
    setBusy(true); setError(''); onDone(''); onLeaving(row.id, list)
    try { await action(); onDone(message) } catch (cause) { onLeaving(null, list); setError(userFacingError(cause, copy.failed)) } finally { setBusy(false) }
  }

  // Repeated buttons carry the message in their accessible name ("Edit: Kickoff").
  const context = <span className="sr-only">: {shortLabel(row)}</span>
  if (editing && (coach || !coachOnly(row.audience))) return <li className="grid gap-3 border-b border-border py-4 last:border-b-0">
    <h3 className="mb-0">{copy.editHeading}</h3>
    <AnnouncementWizard initial={row} pinned={pinned} pinLimit={pinLimit} coach={coach} onCancel={() => setEditing(false)} onSubmit={async values => {
      await update({ id: row.id, title: values.title, body: values.body, showUntil: values.showUntil, audience: values.audience })
      setEditing(false); onDone(copy.changesSaved)
      return ''
    }}/>
  </li>

  return <li className="grid gap-2 border-b border-border py-4 last:border-b-0">
    {row.title && <h3 className="mb-0">{row.title}</h3>}
    <div className="flex flex-wrap gap-2">
      <span className="badge badge-pending w-fit">{copy.audiences[row.audience]}</span>
      {row.urgent && <span className="badge badge-open w-fit">{copy.urgentBadge}</span>}
    </div>
    <p className="mb-0 whitespace-pre-line">{row.body}</p>
    <p className="mb-0 text-sm text-muted-foreground">
      {copy.by(row.authorName, copy.roles[row.authorRole])} · {row.pinnedAt !== null ? copy.pinnedOn(formatDate(row.pinnedAt)) : copy.posted(formatDate(row.createdAt))}
      {row.showUntil !== null && !expired && <> · {copy.showsUntil(formatDate(row.showUntil))}</>}
    </p>
    {expired && row.showUntil !== null && <p className="mb-0 text-sm open-text">{copy.hiddenSince(formatDate(row.showUntil))}</p>}
    {error && <p role="alert" className="mb-0 open-text">{error}</p>}
    {(coach || !coachOnly(row.audience)) && <div className="flex flex-wrap gap-2">
      {row.pinned
        ? <Button type="button" variant="outline" disabled={busy} onClick={() => void move(() => unpin({ id: row.id }), copy.unpinnedDone)}>{copy.unpin}{context}</Button>
        : <Button type="button" variant="outline" disabled={busy || !hasPinRoom(pinned, row.audience, pinLimit)} onClick={() => void move(() => pin({ id: row.id }), copy.pinnedDone)}>{copy.pin}{context}</Button>}
      <Button ref={editButton} type="button" variant="outline" disabled={busy} onClick={() => { setError(''); setEditing(true) }}>{copy.edit}{context}</Button>
      <ConfirmAction title="Remove this announcement?" confirmLabel={copy.remove} disabled={busy} description={copy.removeConfirm(shortLabel(row))} onConfirm={async () => {
        onDone(''); onLeaving(row.id, list)
        try { await archive({ id: row.id }) } catch (cause) { onLeaving(null, list); throw cause }
        onDone(copy.removedDone)
      }}>{copy.remove}{context}</ConfirmAction>
    </div>}
  </li>
}

function AnnouncementList({ title, rows, list, empty, headingRef, pinned, pinLimit, coach, editingId, setEditingId, onLeaving, onDone, children }: {
  title: string
  rows: StaffAnnouncement[]
  list: ListName
  empty: string
  headingRef: RefObject<HTMLHeadingElement | null>
  pinned: StaffAnnouncement[]
  pinLimit: number
  coach: boolean
  editingId: AnnouncementId | null
  setEditingId: (id: AnnouncementId | null) => void
  onLeaving: (id: AnnouncementId | null, list: ListName) => void
  onDone: (message: string) => void
  children?: ReactNode
}) {
  return <Card><CardHeader><CardTitle ref={headingRef} tabIndex={-1} className="outline-none">{title}</CardTitle>{children}</CardHeader><CardContent>
    {rows.length === 0 ? <p className="text-muted-foreground">{empty}</p> : <ul className="m-0 list-none p-0">{rows.map(row => <AnnouncementItem key={row.id} row={row} list={list} pinned={pinned} pinLimit={pinLimit} coach={coach} editing={editingId === row.id} setEditing={editing => setEditingId(editing ? row.id : null)} onLeaving={onLeaving} onDone={onDone}/>)}</ul>}
  </CardContent></Card>
}

/** Coach and Travel Lead page for the messages pinned to Student Home. The route supplies the page heading. */
export function Announcements({ coach }: { coach: boolean }) {
  const list = useQuery(api.announcements.listForStaff, {})
  const create = useMutation(api.announcements.create)
  const [editingId, setEditingId] = useState<AnnouncementId | null>(null)
  const [status, setStatus] = useState('')
  const pinnedHeading = useRef<HTMLHeadingElement>(null)
  const notPinnedHeading = useRef<HTMLHeadingElement>(null)
  const leaving = useRef<{ id: AnnouncementId; list: ListName } | null>(null)
  const onLeaving = (id: AnnouncementId | null, from: ListName) => { leaving.current = id ? { id, list: from } : null }
  // When a message leaves a list (pinned, unpinned or removed), keep keyboard focus on that list's heading.
  useEffect(() => {
    const pending = leaving.current
    if (!pending || !list || list[pending.list].some(row => row.id === pending.id)) return
    leaving.current = null
    ;(pending.list === 'pinned' ? pinnedHeading : notPinnedHeading).current?.focus()
  }, [list])

  if (list === undefined) return <Card><CardContent><p role="status">{copy.loading}</p></CardContent></Card>
  const shared = { pinned: list.pinned, pinLimit: list.pinLimit, coach, editingId, setEditingId, onLeaving, onDone: setStatus }

  return <div className="grid gap-5">
    <Card><CardHeader><CardTitle>{copy.newHeading}</CardTitle></CardHeader><CardContent>
      <AnnouncementWizard pinned={list.pinned} pinLimit={list.pinLimit} coach={coach} onSubmit={async values => {
        await create(values)
        return values.pin ? copy.savedPinned : copy.savedNotPinned
      }}/>
    </CardContent></Card>
    {status && <p role="status" className="ready-text">{status}</p>}
    <AnnouncementList {...shared} title={copy.pinnedHeading(list.pinned.length, list.pinLimit)} rows={list.pinned} list="pinned" empty={copy.noPinned} headingRef={pinnedHeading}>
      {anyHomeFull(list.pinned, list.pinLimit) && <CardDescription>{copy.limitReached}</CardDescription>}
    </AnnouncementList>
    <AnnouncementList {...shared} title={copy.notPinnedHeading(list.notPinned.length)} rows={list.notPinned} list="notPinned" empty={copy.noNotPinned} headingRef={notPinnedHeading}>
      {list.moreNotPinned && <CardDescription>{copy.moreNotPinned(list.notPinned.length)}</CardDescription>}
    </AnnouncementList>
  </div>
}
