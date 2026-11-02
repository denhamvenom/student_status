// Browser side of Web Push. Pure helpers take their inputs as arguments so they can be tested without a DOM.
import { serviceWorkerRegistration } from '@/pwa/register' // Not '@/pwa': keeps React components out of this module's tests.

type DeviceEnv = { userAgent: string; platform?: string; maxTouchPoints?: number }
export type PushKeys = { endpoint: string; p256dh: string; auth: string }

const browserDeviceEnv = (): DeviceEnv => typeof navigator === 'undefined' ? { userAgent: '' } : navigator

/** True when this browser has the service worker, Push and Notification APIs. iOS has them only in a Home Screen app. */
export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** A short name for this device, shown in the device list ("iPhone", "Desktop Chrome"). */
export function deviceLabel(env: DeviceEnv = browserDeviceEnv()): string {
  const ua = env.userAgent
  if (/iPad/.test(ua) || (env.platform === 'MacIntel' && (env.maxTouchPoints ?? 0) > 1)) return 'iPad'
  if (/iPhone|iPod/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return 'Android'
  if (/Edg\//.test(ua)) return 'Desktop Edge'
  if (/Firefox\//.test(ua)) return 'Desktop Firefox'
  if (/Chrome\/|Chromium\//.test(ua)) return 'Desktop Chrome'
  if (/Safari\//.test(ua)) return 'Desktop Safari'
  return 'This device'
}

/** Decodes a base64url VAPID public key into the bytes pushManager.subscribe expects. */
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index)
  return bytes
}

const sameBytes = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.byteLength && new Uint8Array(a).every((byte, index) => byte === b[index])

function keysOf(subscription: PushSubscription): PushKeys | null {
  const { endpoint, keys } = subscription.toJSON()
  return endpoint && keys?.p256dh && keys.auth ? { endpoint, p256dh: keys.p256dh, auth: keys.auth } : null
}

/** The active service worker registration, or null in development, unsupported browsers or after a failed registration. */
async function readyRegistration() {
  if (!isPushSupported() || !(await serviceWorkerRegistration())) return null
  return navigator.serviceWorker.ready
}

/** True when a service worker is registered here, so subscribing can work. */
export async function canSubscribe() {
  return isPushSupported() && !!(await serviceWorkerRegistration())
}

/** Subscribes this device (or reuses its subscription when it already uses this key). Ask for permission first. */
export async function subscribe(publicKey: string): Promise<PushKeys | null> {
  const registration = await readyRegistration()
  if (!registration) return null
  const applicationServerKey = urlBase64ToUint8Array(publicKey)
  const existing = await registration.pushManager.getSubscription()
  if (existing && sameBytes(existing.options.applicationServerKey, applicationServerKey)) return keysOf(existing)
  await existing?.unsubscribe()
  return keysOf(await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }))
}

export async function getCurrentSubscription(): Promise<PushKeys | null> {
  const registration = await readyRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  return subscription ? keysOf(subscription) : null
}

/** Unsubscribes this device. Returns the endpoint that was removed so the server copy can be deleted too. */
export async function unsubscribe(): Promise<string | null> {
  const registration = await readyRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return null
  await subscription.unsubscribe()
  return subscription.endpoint
}
