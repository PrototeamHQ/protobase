import { describe, expect, it } from 'vitest'
import { serviceWorkerCode } from './service-worker-code'

const origin = 'https://app.example'

// The worker's code run against a fake origin: a Cache Storage in a map, and a network that answers `online` or fails.
const startWorker = (version: string, stored: Record<string, Record<string, string>> = {}) => {
  const listeners: Record<string, (event: unknown) => void> = {}
  const network = { online: true, fetched: [] as string[] }
  const key = (request: Request | string) => new URL(typeof request === 'string' ? request : request.url, origin).href
  const caches = {
    open: async (name: string) => {
      const entries = (stored[name] ??= {})
      return {
        put: async (request: Request | string, response: Response) => void (entries[key(request)] = await response.text()),
        addAll: async (requests: Request[]) => Promise.all(requests.map(async (request) => void (entries[key(request)] = await (await fetch(request)).text()))),
      }
    },
    match: async (request: Request | string) => {
      const body = Object.values(stored).find((entries) => key(request) in entries)?.[key(request)]
      return body === undefined ? undefined : new Response(body)
    },
    keys: async () => Object.keys(stored),
    delete: async (name: string) => delete stored[name],
  }
  const fetch = async (request: Request | string) => {
    network.fetched.push(key(request))
    if (!network.online) throw new TypeError('Failed to fetch')
    return new Response(`network ${new URL(key(request)).pathname}`)
  }
  const self = { location: new URL(origin), addEventListener: (type: string, listener: (event: unknown) => void) => void (listeners[type] = listener), skipWaiting: async () => {}, clients: { claim: async () => {} } }
  // A worker's Request resolves a path against the worker's origin.
  const OriginRequest = class extends Request {
    constructor(url: string, init?: RequestInit) {
      super(new URL(url, origin), init)
    }
  }
  new Function('self', 'caches', 'fetch', 'Request', serviceWorkerCode({ version, precache: ['/index.html', '/assets/index-1.js'] }))(self, caches, fetch, OriginRequest)

  const lifecycle = async (type: 'install' | 'activate') => {
    let done: Promise<unknown> = Promise.resolve()
    listeners[type]!({ waitUntil: (promise: Promise<unknown>) => void (done = promise) })
    await done
  }
  // What the worker answers a request with, or undefined when it leaves the request to the browser.
  const request = async (pathname: string, init: { mode?: RequestMode; method?: string } = {}) => {
    let answer: Promise<Response> | undefined
    const url = new URL(pathname, origin).href
    listeners.fetch!({ request: { url, method: init.method ?? 'GET', mode: init.mode ?? 'cors' }, respondWith: (response: Promise<Response>) => void (answer = response) })
    const response = await answer
    await new Promise((resolve) => setTimeout(resolve))
    return response && (await response.text())
  }
  return { network, stored, lifecycle, request }
}

describe('the shell service worker', () => {
  it('caches the page and its first assets on install, and drops the caches of older shells when it takes over', async () => {
    const worker = startWorker('b', { 'protobase-shell-a': { [`${origin}/index.html`]: 'old' }, 'other-cache': {} })
    await worker.lifecycle('install')
    await worker.lifecycle('activate')
    expect(Object.keys(worker.stored)).toEqual(['other-cache', 'protobase-shell-b'])
    expect(Object.keys(worker.stored['protobase-shell-b']!)).toEqual([`${origin}/index.html`, `${origin}/assets/index-1.js`])
  })

  it('answers a navigation from the network, and with the cached page only when the network fails', async () => {
    const worker = startWorker('a')
    await worker.lifecycle('install')
    expect(await worker.request('/orders/1', { mode: 'navigate' })).toBe('network /orders/1')
    worker.network.online = false
    expect(await worker.request('/orders/1', { mode: 'navigate' })).toBe('network /index.html')
  })

  it('answers hashed assets from the cache, filling it from the network', async () => {
    const worker = startWorker('a')
    expect(await worker.request('/assets/lazy-2.js')).toBe('network /assets/lazy-2.js')
    worker.network.online = false
    expect(await worker.request('/assets/lazy-2.js')).toBe('network /assets/lazy-2.js')
  })

  it("keeps the project's theme fresh, the cached copy standing in offline", async () => {
    const worker = startWorker('a', { 'protobase-shell-a': { [`${origin}/protobase.theme.css`]: 'cached theme' } })
    worker.network.online = false
    expect(await worker.request('/protobase.theme.css')).toBe('cached theme')
    worker.network.online = true
    expect(await worker.request('/protobase.theme.css')).toBe('network /protobase.theme.css')
    worker.network.online = false
    expect(await worker.request('/protobase.theme.css')).toBe('network /protobase.theme.css')
  })

  it('leaves the API, writes and other origins to the browser', async () => {
    const worker = startWorker('a')
    expect(await worker.request('/api/meta')).toBeUndefined()
    expect(await worker.request('/api/v1/orders')).toBeUndefined()
    expect(await worker.request('/assets/index-1.js', { method: 'POST' })).toBeUndefined()
    expect(await worker.request('https://tiles.example/assets/x.png')).toBeUndefined()
    expect(worker.network.fetched).toEqual([])
  })
})
