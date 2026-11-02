// Service worker registration (public/sw.js). Production builds only, so development and HMR never meet a cached shell.

type WorkerMessage = { type?: unknown; url?: unknown }
let reloading = false
let registration: Promise<ServiceWorkerRegistration | null> = Promise.resolve(null)

/** Registers the service worker and routes notification clicks ({type:'NAVIGATE', url}) through the app router. */
export function registerServiceWorker(navigate: (to: string) => void, onUpdateReady?: () => void) {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('message', event => {
    const data = event.data as WorkerMessage | null
    // Same-origin paths only: '/x' but never '//host'.
    if (data?.type === 'NAVIGATE' && typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//')) navigate(data.url)
  })
  const start = () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(reg => {
    // A controller exists only on later visits; on first install there is nothing to update.
    const announce = () => { if (navigator.serviceWorker.controller) onUpdateReady?.() }
    if (reg.waiting) announce()
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') announce() })
    })
    return reg
  }).catch(() => null)
  registration = document.readyState === 'complete' ? start() : new Promise(resolve => window.addEventListener('load', () => resolve(start()), { once: true }))
}

/** The active registration, or null in development, unsupported browsers or after a failed registration. */
export function serviceWorkerRegistration() {
  return registration
}

/** Listens for a message type from the service worker, e.g. 'PUSH_SUBSCRIPTION_CHANGED'. Returns an unsubscribe function. */
export function onServiceWorkerMessage(type: string, handler: (data: Record<string, unknown>) => void) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {}
  const listener = (event: MessageEvent) => { const data = event.data as WorkerMessage | null; if (data?.type === type) handler(data as Record<string, unknown>) }
  navigator.serviceWorker.addEventListener('message', listener)
  return () => navigator.serviceWorker.removeEventListener('message', listener)
}

/** Activates a waiting service worker update and reloads once it takes control. Returns false when no update is waiting. */
export async function applyServiceWorkerUpdate() {
  const waiting = (await registration)?.waiting
  if (!waiting) return false
  if (!reloading) navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; window.location.reload() }, { once: true })
  waiting.postMessage({ type: 'SKIP_WAITING' })
  return true
}
