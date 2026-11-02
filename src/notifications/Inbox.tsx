import { useState, type ReactNode } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { Link } from 'react-router'
import { BellRing, CheckCheck, ChevronDown, Inbox as InboxIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { NOTIFICATION_CATEGORY_INFO } from '../../convex/lib/notificationCategories'
import { Button } from '@/components/ui/button'
import { notificationsCopy } from '@/copy/notifications-copy'
import { userFacingError } from '@/lib/error-message'
import { canTurnOnInSettings, thisDeviceState } from './deviceStatus'
import { needsHomeScreen } from './EnableNotifications'
import { relativeTime } from './format'
import { internalPath, opensInPlace } from './inboxItem'
import { usePushDevice } from './usePushDevice'

const copy = notificationsCopy.inbox
const PAGE = 20
const MARK_ALL_ROUNDS = 10
const rowClass = 'flex min-h-16 w-full gap-3 border-0 px-4 py-3 text-left text-[var(--text-body)] hover:bg-[var(--surface-metal)] hover:no-underline'

/** Points to Settings when this device could get alerts but does not yet. Hidden when Settings could not help (unsupported, not set up). */
function TurnOnHint() {
  const publicKey = useQuery(api.push.getVapidPublicKey)
  const device = usePushDevice()
  if (!canTurnOnInSettings(thisDeviceState({ publicKey, device, needsHomeScreen: needsHomeScreen() }))) return null
  return <p className="m-0 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
    <BellRing size={18} aria-hidden="true" className="text-[var(--accent-text)]"/>{copy.turnOnHint}
    <Link to="/settings" className="inline-flex min-h-11 items-center font-bold">{copy.turnOnLink}</Link>
  </p>
}

type Item = { _id: Id<'notifications'>; title: string; body: string; url: string; category: keyof typeof NOTIFICATION_CATEGORY_INFO; createdAt: number; readAt: number | null }

function ItemContent({ item, now, expanded, toggle }: { item: Item; now: number; expanded: boolean; toggle?: ReactNode }) {
  const isUnread = item.readAt === null
  return <>
    <span aria-hidden="true" className={`mt-2 size-2.5 shrink-0 rounded-full ${isUnread ? 'bg-[var(--purple-700)]' : 'bg-transparent'}`}/>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="font-bold uppercase tracking-wide text-[var(--accent-text)]">{NOTIFICATION_CATEGORY_INFO[item.category].label}{isUnread && <span className="sr-only">, {copy.unread}</span>}</span>
        <time dateTime={new Date(item.createdAt).toISOString()} className="muted font-normal">{relativeTime(item.createdAt, now)}</time>
      </span>
      <span className={isUnread ? 'font-bold' : 'font-normal'}>{item.title}</span>
      <span className={`muted text-sm font-normal whitespace-pre-line ${expanded ? '' : 'line-clamp-2'}`}>{item.body}</span>
      {toggle}
    </span>
  </>
}

/** The signed-in person's messages, newest first. The app icon badge is cleared while this page is open (useNotificationSync). */
export function Inbox() {
  const messages = usePaginatedQuery(api.notifications.listMine, {}, { initialNumItems: PAGE })
  const unread = useQuery(api.notifications.unreadCount)
  const markRead = useMutation(api.notifications.markRead)
  const markAllRead = useMutation(api.notifications.markAllRead)
  const [now] = useState(Date.now)
  const [marking, setMarking] = useState(false)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState('')
  const markAll = async () => {
    setMarking(true); setError('')
    try { for (let round = 0; round < MARK_ALL_ROUNDS; round++) if (!(await markAllRead({})).more) break }
    catch (cause) { setError(userFacingError(cause, copy.markFailed)) }
    finally { setMarking(false) }
  }
  const markIfUnread = (item: Item) => { if (item.readAt === null) void markRead({ notificationId: item._id }).catch(() => {}) }
  const toggle = (item: Item) => {
    const next = new Set(open)
    if (next.has(item._id)) next.delete(item._id)
    else { next.add(item._id); markIfUnread(item) }
    setOpen(next)
  }
  if (messages.status === 'LoadingFirstPage') return <div className="card"><p role="status" className="m-0">{copy.loading}</p></div>
  if (!messages.results.length) return <div className="card flex flex-col items-center gap-3 py-10 text-center"><InboxIcon size={40} aria-hidden="true" className="text-[var(--text-muted)]"/><p className="m-0 max-w-sm">{copy.empty}</p><TurnOnHint/></div>
  return <>
    {!!unread && <p className="action-row"><Button type="button" variant="outline" disabled={marking} onClick={() => void markAll()}><CheckCheck aria-hidden="true"/>{marking ? copy.marking : copy.markAll}</Button></p>}
    {error && <p role="alert" className="open-text">{error}</p>}
    <ul className="card m-0 flex list-none flex-col p-0">
      {messages.results.map(item => {
        const highlight = item.readAt === null ? 'bg-[var(--gold-100)]/40' : 'bg-transparent'
        if (opensInPlace(item)) {
          const expanded = open.has(item._id)
          return <li key={item._id} className="border-b border-[var(--border-default)] last:border-b-0">
            <button type="button" aria-expanded={expanded} onClick={() => toggle(item)} className={`${rowClass} ${highlight}`}>
              <ItemContent item={item} now={now} expanded={expanded} toggle={<span className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-[var(--accent-text)]">{expanded ? copy.showLess : copy.showMore}<ChevronDown size={16} aria-hidden="true" className={expanded ? 'rotate-180' : ''}/></span>}/>
            </button>
          </li>
        }
        return <li key={item._id} className="border-b border-[var(--border-default)] last:border-b-0">
          <Link to={internalPath(item.url)} onClick={() => markIfUnread(item)} className={`${rowClass} ${highlight}`} style={{ textDecoration: 'none' }}>
            <ItemContent item={item} now={now} expanded/>
          </Link>
        </li>
      })}
    </ul>
    {messages.status !== 'Exhausted' && <p className="action-row mt-4"><Button type="button" variant="outline" disabled={messages.status !== 'CanLoadMore'} onClick={() => messages.loadMore(PAGE)}>{messages.status === 'LoadingMore' ? copy.loadingMore : copy.loadMore}</Button></p>}
  </>
}
