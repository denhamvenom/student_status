/* global self, caches, fetch, Request, Response */
// Venom Status service worker: offline app shell, cached build assets, and push notifications.
// Hand-written; registered from src/pwa/register.ts in production builds only.
// Only static files are cached. Convex data (cross-origin HTTP and websocket) never passes through here.
const VERSION = 'v1';
const SHELL_CACHE = `venom-shell-${VERSION}`;
const ASSET_CACHE = `venom-assets-${VERSION}`;
const MAX_ASSET_ENTRIES = 150;
const PRECACHE = ['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon-180.png', '/icons/favicon-32.png', '/icons/badge-96.png'];
const ICON = '/icons/icon-192.png';
const BADGE = '/icons/badge-96.png';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(PRECACHE.map(path => new Request(path, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
    await Promise.all((await caches.keys()).filter(key => key.startsWith('venom-') && !keep.has(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') { event.respondWith(navigation(event, request, url)); return; }
  if (url.pathname.startsWith('/assets/')) { event.respondWith(staleWhileRevalidate(event, request, ASSET_CACHE)); return; }
  if (PRECACHE.includes(url.pathname) && url.search === '') event.respondWith(staleWhileRevalidate(event, request, SHELL_CACHE));
});

// Every app route is served the same SPA index.html, so the latest one is kept as '/' for offline starts.
const isAppRoute = pathname => pathname === '/' || !pathname.split('/').pop().includes('.');

async function navigation(event, request, url) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic' && isAppRoute(url.pathname) && (response.headers.get('content-type') || '').includes('text/html')) {
      const copy = response.clone();
      event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.put('/', copy)).catch(() => {}));
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (isAppRoute(url.pathname) && await cache.match('/')) || await cache.match('/offline.html') || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function staleWhileRevalidate(event, request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(async response => {
    if (response.ok && response.type === 'basic') {
      await cache.put(request, response.clone());
      if (cacheName === ASSET_CACHE) await trim(cache);
    }
    return response;
  });
  if (cached) { event.waitUntil(network.catch(() => {})); return cached; }
  return network;
}

// Hashed build files pile up across deploys; drop the oldest beyond the cap.
async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSET_ENTRIES)).map(key => cache.delete(key)));
}

// Push payload contract: {title, body, url, category, tag?, badgeCount?, notificationId?}.
function sameOriginPath(value) {
  try {
    const url = new URL(typeof value === 'string' && value ? value : '/', self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search + url.hash : '/';
  } catch {
    return '/';
  }
}

function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (!data || typeof data !== 'object' || typeof data.title !== 'string' || !data.title) return null;
    return data;
  } catch {
    return null;
  }
}

self.addEventListener('push', event => {
  const payload = readPayload(event);
  const title = payload ? payload.title : 'Denham Venom';
  const options = {
    body: payload && typeof payload.body === 'string' ? payload.body : 'You have a new update in Venom Status.',
    icon: ICON,
    badge: BADGE,
    data: { url: sameOriginPath(payload && payload.url), category: payload && typeof payload.category === 'string' ? payload.category : undefined, notificationId: payload ? payload.notificationId : undefined },
  };
  if (payload && typeof payload.tag === 'string' && payload.tag) options.tag = payload.tag;
  const work = [self.registration.showNotification(title, options)];
  if (payload && typeof payload.badgeCount === 'number' && self.navigator.setAppBadge) work.push(Promise.resolve(self.navigator.setAppBadge(payload.badgeCount)).catch(() => {}));
  event.waitUntil(Promise.all(work));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = sameOriginPath(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(client => new URL(client.url).origin === self.location.origin);
    const client = windows.find(candidate => candidate.focused) || windows[0];
    if (!client) { await self.clients.openWindow(url); return; }
    const focused = await client.focus().catch(() => client);
    // The app routes NAVIGATE messages in place (src/pwa/register.ts), keeping its live connection.
    (focused || client).postMessage({ type: 'NAVIGATE', url });
  })());
});

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => clients.forEach(client => client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }))));
});
