import { useEffect } from 'react'
import { useConvex, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { onServiceWorkerMessage } from '@/pwa'
import { deviceLabel, subscribe } from './pushClient'
import { refreshPushDevice } from './usePushDevice'
import { NotificationsBoundary } from './NotificationsBoundary'

type BadgeNavigator = Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }

/** Sets the app icon badge; feature-detected, and failures (no permission, unsupported) are ignored. */
export function setAppBadge(count: number) {
  if (typeof navigator === 'undefined') return
  const nav = navigator as BadgeNavigator
  try { void (count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => {}) } catch { /* unsupported */ }
}

/**
 * Mounted once in the app shell. Keeps the app icon badge equal to the unread count (cleared while the Inbox is open),
 * and re-saves this device when the browser replaces its notification subscription.
 */
export function useNotificationSync(viewingInbox: boolean) {
  const unread = useQuery(api.notifications.unreadCount)
  const convex = useConvex()
  const save = useMutation(api.push.saveSubscription)
  useEffect(() => { if (unread !== undefined || viewingInbox) setAppBadge(viewingInbox ? 0 : unread ?? 0) }, [unread, viewingInbox])
  useEffect(() => onServiceWorkerMessage('PUSH_SUBSCRIPTION_CHANGED', () => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    void (async () => {
      const key = await convex.query(api.push.getVapidPublicKey, {})
      const keys = key ? await subscribe(key) : null
      if (keys) await save({ ...keys, deviceLabel: deviceLabel() })
      await refreshPushDevice()
    })().catch(() => {})
  }), [convex, save])
}

/** Renders nothing; runs the badge/subscription sync inside its own error boundary so a notifications failure cannot crash the shell. */
export function NotificationSync({ viewingInbox }: { viewingInbox: boolean }) {
  return <NotificationsBoundary><SyncRunner viewingInbox={viewingInbox}/></NotificationsBoundary>
}

function SyncRunner({ viewingInbox }: { viewingInbox: boolean }) {
  useNotificationSync(viewingInbox)
  return null
}
