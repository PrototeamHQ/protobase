import { serviceWorkerFile } from '@protobase/schema/internal'
import { faviconFile } from './favicon'
import { pushHandlersCode } from './service-worker-push-code'
import { themeFile } from './theme'

/** The service worker's file in the shell, at the root so it may answer the whole origin. */
export { serviceWorkerFile }

/**
 * The shell's service worker, which makes the admin app open without a network and then say the API is unreachable;
 * data is never cached. A build of the shell names its own `version`, so a new shell's worker replaces the old one and
 * drops its cache. `precache` is what the page loads first: the page itself and the assets it links.
 *
 * - A navigation goes to the network, and only when that fails gets the cached page, so an online app is always the
 *   server's.
 * - The content-hashed assets under /assets come from the cache, filled as the app loads them.
 * - The project's theme and favicon go to the network, the cached copy standing in when it fails.
 * - Everything else, the API above all, never reaches the worker's cache.
 *
 * It also shows push notifications and opens them on tap (see `pushHandlersCode`).
 */
export const serviceWorkerCode = ({ version, precache }: { version: string; precache: string[] }) => `const cacheName = ${JSON.stringify(`protobase-shell-${version}`)}
const precache = ${JSON.stringify(precache)}
const revalidated = ${JSON.stringify([`/${themeFile}`, `/${faviconFile}`])}

const fromCache = (request) =>
  caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) caches.open(cacheName).then((cache) => cache.put(request, response.clone()))
    return response
  }))

const fromNetwork = (request, fallback) =>
  fetch(request).then((response) => {
    if (response.ok && fallback === request) caches.open(cacheName).then((cache) => cache.put(request, response.clone()))
    return response
  }, (error) => caches.match(fallback).then((cached) => cached || Promise.reject(error)))

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(precache.map((url) => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  const old = (key) => key.startsWith('protobase-shell-') && key !== cacheName
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter(old).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (request.mode === 'navigate') event.respondWith(fromNetwork(request, '/index.html'))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(fromCache(request))
  else if (revalidated.includes(url.pathname)) event.respondWith(fromNetwork(request, request))
})

${pushHandlersCode}`
