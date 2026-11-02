import { useSyncExternalStore } from 'react'
import { canSubscribe, getCurrentSubscription } from './pushClient'

export type PushPermission = NotificationPermission | 'unsupported'
type DeviceState = { checked: boolean; supported: boolean; permission: PushPermission; endpoint: string | null }

// Shared by the Turn on button and the device list, so turning this device off in one updates the other.
let state: DeviceState = { checked: false, supported: false, permission: 'unsupported', endpoint: null }
const listeners = new Set<() => void>()
let started = false

/** Re-reads permission and this device's subscription. Call after turning notifications on or off. */
export async function refreshPushDevice() {
  const supported = await canSubscribe().catch(() => false)
  const endpoint = supported ? (await getCurrentSubscription().catch(() => null))?.endpoint ?? null : null
  state = { checked: true, supported, permission: supported ? Notification.permission : 'unsupported', endpoint }
  listeners.forEach(listener => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  if (!started) {
    started = true
    void refreshPushDevice()
    // People unblock notifications in phone or browser settings, then come back to the app.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refreshPushDevice() })
  }
  return () => { listeners.delete(listener) }
}
const serverState: DeviceState = state

/** Whether this device can get notifications, the browser permission, and this device's endpoint when it is on. */
export function usePushDevice() {
  return useSyncExternalStore(subscribe, () => state, () => serverState)
}
