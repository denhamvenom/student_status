import { useQuery } from 'convex/react'
import { Link, useLocation } from 'react-router'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '../../convex/_generated/api'
import { notificationsCopy } from '@/copy/notifications-copy'
import { unreadBadge } from './format'
import { NotificationsBoundary } from './NotificationsBoundary'

const copy = notificationsCopy.bell
const defaultCount = 'absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-[#fdd023] px-1 text-center text-[11px] font-bold leading-5 text-[#222]'

function BellLink({ unread = 0, className, countClassName, showLabel = false }: { unread?: number; className?: string; countClassName?: string; showLabel?: boolean }) {
  const { pathname } = useLocation()
  const count = unread > 0 ? unreadBadge(unread) : null
  return <Link to="/inbox" aria-label={count ? copy.labelWithCount(count) : copy.label} aria-current={pathname === '/inbox' ? 'page' : undefined} className={cn('relative inline-flex items-center justify-center', className)} style={{ textDecoration: 'none' }}>
    <Bell size={showLabel ? undefined : 20} aria-hidden="true"/>
    {showLabel && <span>{copy.label}</span>}
    {count && <span aria-hidden="true" className={countClassName ?? defaultCount}>{count}</span>}
  </Link>
}

type BellProps = { className?: string; countClassName?: string; showLabel?: boolean }

function BellWithCount(props: BellProps) {
  const unread = useQuery(api.notifications.unreadCount) ?? 0
  return <BellLink unread={unread} {...props}/>
}

/** Bell link to /inbox with the unread count (99+). `showLabel` adds the word Inbox, for side menus. If the count fails, the bell still links to the Inbox. */
export function NotificationBell(props: BellProps) {
  return <NotificationsBoundary fallback={<BellLink {...props}/>}><BellWithCount {...props}/></NotificationsBoundary>
}
