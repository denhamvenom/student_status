import { userFacingError } from '@/lib/error-message'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ConfirmAction } from '../../ConfirmAction'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { chicagoInputTime, parseChicagoInput } from '../../lib/chicago-time'
import { announcementsCopy as copy } from './copy'

type StaffAnnouncement = FunctionReturnType<typeof api.announcements.listForStaff>['pinned'][number]
type AnnouncementId = Id<'teamAnnouncements'>
type ListName = 'pinned' | 'notPinned'
type Values = { title?: string; body: string; showUntil?: number; pin: boolean }

const TITLE_MAX = 80
const BODY_MAX = 500
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Chicago' })
const formatDate = (at: number) => dateFormat.format(at)
/** The America/Chicago calendar date (YYYY-MM-DD) that a date input shows for this time. */
const chicagoDate = (at: number) => chicagoInputTime(at).slice(0, 10)
/** A chosen Show until date lasts through the end of that day in America/Chicago. */
function endOfChicagoDay(date: string) {
  const lastMinute = parseChicagoInput(`${date}T23:59`)
  return Number.isNaN(lastMinute) ? Number.NaN : lastMinute + 59_999
}
const shortLabel = (row: StaffAnnouncement) => row.title ?? (row.body.length > 60 ? `${row.body.slice(0, 57).trimEnd()}…` : row.body)

function AnnouncementForm({ initial, pinAvailable, submitLabel, onSubmit, onCancel }: {
  initial: { title: string | null; body: string; showUntil: number | null }
  /** Set only when creating: whether another pin fits under the five-pin limit. */
  pinAvailable?: boolean
  submitLabel: string
  onSubmit: (values: Values) => Promise<string>
  onCancel?: () => void
}) {
  const id = useId()
  const initialDate = initial.showUntil === null ? '' : chicagoDate(initial.showUntil)
  const [title, setTitle] = useState(initial.title ?? '')
  const [body, setBody] = useState(initial.body)
  const [date, setDate] = useState(initialDate)
  const [pin, setPin] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const titleInput = useRef<HTMLInputElement>(null)
  const editing = onCancel !== undefined
  const creating = pinAvailable !== undefined
  const willPin = creating && pin && pinAvailable === true
  useEffect(() => { if (editing) titleInput.current?.focus() }, [editing])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    // Keep an unchanged date exactly as saved, so an edit does not move it.
    const showUntil = date === '' ? undefined : date === initialDate && initial.showUntil !== null ? initial.showUntil : endOfChicagoDay(date)
    if (showUntil !== undefined && Number.isNaN(showUntil)) { setError(copy.invalidDate); return }
    setBusy(true); setError(''); setDone('')
    try {
      const message = await onSubmit({ title: title.trim() || undefined, body, showUntil, pin: willPin })
      if (creating) { setTitle(''); setBody(''); setDate(''); setPin(true) }
      setDone(message)
    } catch (cause) { setError(userFacingError(cause, copy.failed)) } finally { setBusy(false) }
  }

  return <form className="grid gap-4" onSubmit={event => void submit(event)} onKeyDown={event => { if (event.key === 'Escape' && onCancel && !busy) { event.preventDefault(); onCancel() } }}>
    <label className="grid gap-2 font-semibold">{copy.titleLabel}<Input ref={titleInput} value={title} maxLength={TITLE_MAX} disabled={busy} onChange={event => { setTitle(event.target.value); setDone('') }}/></label>
    <label className="grid gap-2 font-semibold">{copy.messageLabel}<Textarea value={body} required maxLength={BODY_MAX} rows={4} disabled={busy} aria-describedby={`${id}-count`} onChange={event => { setBody(event.target.value); setDone('') }}/></label>
    <p id={`${id}-count`} className="-mt-2 text-sm text-muted-foreground">{copy.characters(body.length, BODY_MAX)}</p>
    <label className="grid gap-2 font-semibold">{copy.showUntilLabel}<Input type="date" value={date} min={date !== initialDate ? chicagoDate(Date.now()) : undefined} disabled={busy} aria-describedby={`${id}-until`} onChange={event => { setDate(event.target.value); setDone('') }}/></label>
    <p id={`${id}-until`} className="-mt-2 text-sm text-muted-foreground">{copy.showUntilHint}</p>
    {creating && <>
      <label className="flex min-h-11 items-center gap-3"><Checkbox className="size-6" checked={willPin} disabled={busy || !pinAvailable} aria-describedby={pinAvailable ? undefined : `${id}-limit`} onCheckedChange={setPin}/><span>{copy.pinLabel}</span></label>
      {!pinAvailable && <p id={`${id}-limit`} className="-mt-2 text-sm text-muted-foreground">{copy.limitReached}</p>}
    </>}
    {error && <p role="alert" className="open-text">{error}</p>}
    {done && <p role="status" className="ready-text">{done}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy}>{busy ? copy.saving : submitLabel}</Button>
      {onCancel && <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{copy.cancel}</Button>}
    </div>
  </form>
}

function AnnouncementItem({ row, list, pinAvailable, editing, setEditing, onLeaving, onDone }: {
  row: StaffAnnouncement
  list: ListName
  pinAvailable: boolean
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
  if (editing) return <li className="grid gap-3 border-b border-border py-4 last:border-b-0">
    <h3 className="mb-0">{copy.editHeading}</h3>
    <AnnouncementForm initial={row} submitLabel={copy.saveChanges} onCancel={() => setEditing(false)} onSubmit={async values => {
      await update({ id: row.id, title: values.title, body: values.body, showUntil: values.showUntil })
      setEditing(false); onDone(copy.changesSaved)
      return ''
    }}/>
  </li>

  return <li className="grid gap-2 border-b border-border py-4 last:border-b-0">
    {row.title && <h3 className="mb-0">{row.title}</h3>}
    <p className="mb-0 whitespace-pre-line">{row.body}</p>
    <p className="mb-0 text-sm text-muted-foreground">
      {copy.by(row.authorName, copy.roles[row.authorRole])} · {row.pinnedAt !== null ? copy.pinnedOn(formatDate(row.pinnedAt)) : copy.posted(formatDate(row.createdAt))}
      {row.showUntil !== null && !expired && <> · {copy.showsUntil(formatDate(row.showUntil))}</>}
    </p>
    {expired && row.showUntil !== null && <p className="mb-0 text-sm open-text">{copy.hiddenSince(formatDate(row.showUntil))}</p>}
    {error && <p role="alert" className="mb-0 open-text">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {row.pinned
        ? <Button type="button" variant="outline" disabled={busy} onClick={() => void move(() => unpin({ id: row.id }), copy.unpinnedDone)}>{copy.unpin}{context}</Button>
        : <Button type="button" variant="outline" disabled={busy || !pinAvailable} onClick={() => void move(() => pin({ id: row.id }), copy.pinnedDone)}>{copy.pin}{context}</Button>}
      <Button ref={editButton} type="button" variant="outline" disabled={busy} onClick={() => { setError(''); setEditing(true) }}>{copy.edit}{context}</Button>
      <ConfirmAction disabled={busy} description={copy.removeConfirm(shortLabel(row))} onConfirm={async () => {
        onDone(''); onLeaving(row.id, list)
        try { await archive({ id: row.id }) } catch (cause) { onLeaving(null, list); throw cause }
        onDone(copy.removedDone)
      }}>{copy.remove}{context}</ConfirmAction>
    </div>
  </li>
}

function AnnouncementList({ title, rows, list, empty, headingRef, pinAvailable, editingId, setEditingId, onLeaving, onDone, children }: {
  title: string
  rows: StaffAnnouncement[]
  list: ListName
  empty: string
  headingRef: RefObject<HTMLHeadingElement | null>
  pinAvailable: boolean
  editingId: AnnouncementId | null
  setEditingId: (id: AnnouncementId | null) => void
  onLeaving: (id: AnnouncementId | null, list: ListName) => void
  onDone: (message: string) => void
  children?: ReactNode
}) {
  return <Card><CardHeader><CardTitle ref={headingRef} tabIndex={-1} className="outline-none">{title}</CardTitle>{children}</CardHeader><CardContent>
    {rows.length === 0 ? <p className="text-muted-foreground">{empty}</p> : <ul className="m-0 list-none p-0">{rows.map(row => <AnnouncementItem key={row.id} row={row} list={list} pinAvailable={pinAvailable} editing={editingId === row.id} setEditing={editing => setEditingId(editing ? row.id : null)} onLeaving={onLeaving} onDone={onDone}/>)}</ul>}
  </CardContent></Card>
}

/** Coach and Travel Lead page for the messages pinned to Student Home. The route supplies the page heading. */
export function Announcements() {
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
  const pinAvailable = list.pinned.length < list.pinLimit
  const shared = { pinAvailable, editingId, setEditingId, onLeaving, onDone: setStatus }

  return <div className="grid gap-5">
    <Card><CardHeader><CardTitle>{copy.newHeading}</CardTitle></CardHeader><CardContent>
      <AnnouncementForm initial={{ title: null, body: '', showUntil: null }} pinAvailable={pinAvailable} submitLabel={copy.save} onSubmit={async values => {
        await create(values)
        return values.pin ? copy.savedPinned : copy.savedNotPinned
      }}/>
    </CardContent></Card>
    {status && <p role="status" className="ready-text">{status}</p>}
    <AnnouncementList {...shared} title={copy.pinnedHeading(list.pinned.length, list.pinLimit)} rows={list.pinned} list="pinned" empty={copy.noPinned} headingRef={pinnedHeading}>
      {!pinAvailable && <CardDescription>{copy.limitReached}</CardDescription>}
    </AnnouncementList>
    <AnnouncementList {...shared} title={copy.notPinnedHeading(list.notPinned.length)} rows={list.notPinned} list="notPinned" empty={copy.noNotPinned} headingRef={notPinnedHeading}>
      {list.moreNotPinned && <CardDescription>{copy.moreNotPinned(list.notPinned.length)}</CardDescription>}
    </AnnouncementList>
  </div>
}
