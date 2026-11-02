import { useState } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { Link } from 'react-router'
import { CheckCheck, Inbox as InboxIcon } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { NOTIFICATION_CATEGORY_INFO } from '../../convex/lib/notificationCategories'
import { Button } from '@/components/ui/button'
import { notificationsCopy } from '@/copy/notifications-copy'
import { userFacingError } from '@/lib/error-message'
import { relativeTime } from './format'

const copy = notificationsCopy.inbox
const PAGE = 20
const MARK_ALL_ROUNDS = 10
// Notification links come from the server; anything that is not a same-origin path opens Home instead.
const internalPath = (url: string) => url.startsWith('/') && !url.startsWith('//') ? url : '/'

/** The signed-in person's messages, newest first. The app icon badge is cleared while this page is open (useNotificationSync). */
export function Inbox() {
  const messages = usePaginatedQuery(api.notifications.listMine, {}, { initialNumItems: PAGE })
  const unread = useQuery(api.notifications.unreadCount)
  const markRead = useMutation(api.notifications.markRead)
  const markAllRead = useMutation(api.notifications.markAllRead)
  const [now] = useState(Date.now)
  const [marking, setMarking] = useState(false)
  const [error, setError] = useState('')
  const markAll = async () => {
    setMarking(true); setError('')
    try { for (let round = 0; round < MARK_ALL_ROUNDS; round++) if (!(await markAllRead({})).more) break }
    catch (cause) { setError(userFacingError(cause, copy.markFailed)) }
    finally { setMarking(false) }
  }
  if (messages.status === 'LoadingFirstPage') return <div className="card"><p role="status" className="m-0">{copy.loading}</p></div>
  if (!messages.results.length) return <div className="card flex flex-col items-center gap-3 py-10 text-center"><InboxIcon size={40} aria-hidden="true" className="text-[var(--text-muted)]"/><p className="m-0 max-w-sm">{copy.empty}</p></div>
  return <>
    {!!unread && <p className="action-row"><Button type="button" variant="outline" disabled={marking} onClick={() => void markAll()}><CheckCheck aria-hidden="true"/>{marking ? copy.marking : copy.markAll}</Button></p>}
    {error && <p role="alert" className="open-text">{error}</p>}
    <ul className="card m-0 flex list-none flex-col p-0">
      {messages.results.map(item => {
        const isUnread = item.readAt === null
        return <li key={item._id} className="border-b border-[var(--border-default)] last:border-b-0">
          <Link to={internalPath(item.url)} onClick={() => { if (isUnread) void markRead({ notificationId: item._id }).catch(() => {}) }} className={`flex min-h-16 gap-3 px-4 py-3 text-[var(--text-body)] hover:bg-[var(--surface-metal)] hover:no-underline ${isUnread ? 'bg-[var(--gold-100)]/40' : ''}`} style={{ textDecoration: 'none' }}>
            <span aria-hidden="true" className={`mt-2 size-2.5 shrink-0 rounded-full ${isUnread ? 'bg-[var(--purple-700)]' : 'bg-transparent'}`}/>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                <span className="font-bold uppercase tracking-wide text-[var(--accent-text)]">{NOTIFICATION_CATEGORY_INFO[item.category].label}{isUnread && <span className="sr-only">, {copy.unread}</span>}</span>
                <time dateTime={new Date(item.createdAt).toISOString()} className="muted font-normal">{relativeTime(item.createdAt, now)}</time>
              </span>
              <span className={isUnread ? 'font-bold' : 'font-normal'}>{item.title}</span>
              <span className="muted text-sm font-normal">{item.body}</span>
            </span>
          </Link>
        </li>
      })}
    </ul>
    {messages.status !== 'Exhausted' && <p className="action-row mt-4"><Button type="button" variant="outline" disabled={messages.status !== 'CanLoadMore'} onClick={() => messages.loadMore(PAGE)}>{messages.status === 'LoadingMore' ? copy.loadingMore : copy.loadMore}</Button></p>}
  </>
}
