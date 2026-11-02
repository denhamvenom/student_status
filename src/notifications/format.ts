import { notificationsCopy as copy } from '@/copy/notifications-copy'

/** Unread count for the bell and the app badge; the server caps it at 99. */
export function unreadBadge(count: number): string {
  return count >= 99 ? '99+' : String(count)
}

/** Short relative time for an inbox item: "Just now", "5 min ago", "3 hr ago", "Yesterday", "4 days ago", then a date. */
export function relativeTime(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return copy.time.justNow
  if (minutes < 60) return copy.time.minutes(minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return copy.time.hours(hours)
  const days = Math.floor(hours / 24)
  if (days === 1) return copy.time.yesterday
  if (days < 7) return copy.time.days(days)
  const date = new Date(at)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(date.getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }) })
}
