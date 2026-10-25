import { describe, expect, it } from 'vitest'
import { pushRecord } from '@protobase/schema/internal'
import { devServiceWorkerCode, pushHandlersCode } from './service-worker-push-code'
import { serviceWorkerCode } from './service-worker-code'

const origin = 'https://app.example.com'
const endpoint = 'https://fcm.googleapis.com/fcm/send/this-browser'

type PushRecord = { userId: string; endpoint: string; appName?: string; renew?: boolean }

// One IndexedDB database holding the push record, as the browser keeps it, answering requests a tick later.
const fakeIndexedDb = (stored: Map<string, unknown>) => {
  const answer = <T>(act: () => T) => {
    const request = { result: undefined as T | undefined, onsuccess: () => {}, onerror: () => {} }
    queueMicrotask(() => {
      request.result = act()
      request.onsuccess()
    })
    return request
  }
  const db = {
    close: () => {},
    createObjectStore: () => {},
    transaction: (store: string) => {
      expect(store).toBe(pushRecord.store)
      return {
        objectStore: () => ({
          get: (key: string) => answer(() => stored.get(key)),
          put: (value: unknown, key: string) => answer(() => void stored.set(key, value)),
          delete: (key: string) => answer(() => void stored.delete(key)),
        }),
      }
    },
  }
  return {
    open: (name: string) => {
      expect(name).toBe(pushRecord.database)
      const request = { result: db, onsuccess: () => {}, onerror: () => {}, onupgradeneeded: () => {} }
      queueMicrotask(() => request.onsuccess())
      return request
    },
  }
}

type Shown = { title: string; options: Record<string, unknown>; closed: boolean }
type Window = { url: string; navigated: string[]; focused: boolean; controlled: boolean }

// The worker's code run against a fake browser: the record, the subscription, what it shows and the app's windows.
const startWorker = ({ record, windows = [], subscribed = true, code = pushHandlersCode, UrlClass = URL }: { record?: PushRecord; windows?: Window[]; subscribed?: boolean; code?: string; UrlClass?: typeof URL } = {}) => {
  const stored = new Map<string, unknown>(record ? [[pushRecord.key, record]] : [])
  const listeners: Record<string, (event: unknown) => void> = {}
  const shown: Shown[] = []
  const opened: string[] = []
  const badge = { set: [] as number[], cleared: 0 }
  const subscription = { subscribed, endpoint }
  const self = {
    location: new URL(origin),
    indexedDB: fakeIndexedDb(stored),
    addEventListener: (type: string, listener: (event: unknown) => void) => void (listeners[type] = listener),
    skipWaiting: async () => {},
    navigator: { setAppBadge: async (count: number) => void badge.set.push(count), clearAppBadge: async () => void (badge.cleared += 1) },
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options, closed: false }),
      getNotifications: async () => shown.filter((notification) => !notification.closed).map((notification) => ({ close: () => (notification.closed = true) })),
      pushManager: {
        getSubscription: async () =>
          subscription.subscribed
            ? {
                endpoint: subscription.endpoint,
                unsubscribe: async () => {
                  subscription.subscribed = false
                  return true
                },
              }
            : null,
      },
    },
    clients: {
      claim: async () => {},
      openWindow: async (url: string) => void opened.push(url),
      matchAll: async () =>
        windows.map((client) => ({
          url: client.url,
          focus: async () => {
            client.focused = true
            return {
              navigate: async (url: string) => {
                if (!client.controlled) throw new TypeError('This client is not controlled by the worker')
                client.navigated.push(url)
              },
            }
          },
        })),
    },
  }
  new Function('self', 'URL', code)(self, UrlClass)

  const dispatch = async (type: string, fields: Record<string, unknown>) => {
    let done: Promise<unknown> = Promise.resolve()
    listeners[type]!({ ...fields, waitUntil: (promise: Promise<unknown>) => void (done = promise) })
    await done
  }
  const push = (data?: unknown) => dispatch('push', { data: data === undefined ? null : { json: () => (typeof data === 'string' ? JSON.parse(data) : data) } })
  const click = (data: unknown) => dispatch('notificationclick', { notification: { data, close: () => {} } })
  return { push, click, dispatch, shown, opened, badge, subscription, record: () => stored.get(pushRecord.key) as PushRecord | undefined }
}

const alice = { userId: 'alice', endpoint, appName: 'Tasks' }
const appWindow = (controlled = true): Window => ({ url: `${origin}/tasks`, navigated: [], focused: false, controlled })

describe('the service worker on a push', () => {
  it("shows the title, body, tag and url of a push for the browser's user, and sets the badge", async () => {
    const worker = startWorker({ record: alice })
    await worker.push({ title: 'Task assigned', body: 'Ship it', tag: 'task-1', url: `${origin}/tasks/1`, badge: 3, user: 'alice' })
    expect(worker.shown).toEqual([{ title: 'Task assigned', options: { body: 'Ship it', tag: 'task-1', data: { url: `${origin}/tasks/1` } }, closed: false }])
    expect(worker.badge.set).toEqual([3])
    expect(worker.subscription.subscribed).toBe(true)
  })

  it.each([
    ['no record', undefined, 'alice'],
    ['a record of another endpoint', { ...alice, endpoint: 'https://fcm.googleapis.com/fcm/send/old' }, 'alice'],
    ['a push for another user', alice, 'bob'],
    ['a push naming no user', alice, undefined],
  ])('shows nothing for %s, closes what it showed, clears the badge, drops the record and unsubscribes', async (_, record, user) => {
    const worker = startWorker({ ...(record && { record }) })
    worker.shown.push({ title: 'Earlier', options: {}, closed: false })
    await worker.push({ title: 'Private', body: 'Private body', url: `${origin}/secret`, user })
    expect(worker.shown).toEqual([{ title: 'Earlier', options: {}, closed: true }])
    expect(worker.badge.cleared).toBe(1)
    expect(worker.record()).toBeUndefined()
    expect(worker.subscription.subscribed).toBe(false)
  })

  it.each([
    ['no data', undefined],
    ['data that is not JSON', 'not json {'],
    ['JSON that is no object', '[1, 2]'],
    ['no title', { body: 'Private body', url: `${origin}/x`, user: 'alice' }],
    ['a title that is no text', { title: 42, body: 'Private body', user: 'alice' }],
  ])("shows the app's name alone for a push with %s, and throws nothing", async (_, data) => {
    const worker = startWorker({ record: alice })
    await worker.push(data)
    expect(worker.shown).toEqual([{ title: 'Tasks', options: {}, closed: false }])
  })

  it('leaves out fields that are no text, and a url that may not open', async () => {
    const worker = startWorker({ record: alice })
    await worker.push({ title: 'Hi', body: { html: '<b>x</b>' }, tag: 7, url: 'javascript:alert(1)', badge: '3', user: 'alice' })
    expect(worker.shown).toEqual([{ title: 'Hi', options: {}, closed: false }])
    expect(worker.badge.set).toEqual([])
  })

  it('marks an existing record for renewal when the subscription changes, and makes none without one', async () => {
    const renewed = startWorker({ record: alice })
    await renewed.dispatch('pushsubscriptionchange', {})
    expect(renewed.record()).toEqual({ ...alice, renew: true })
    const none = startWorker()
    await none.dispatch('pushsubscriptionchange', {})
    expect(none.record()).toBeUndefined()
  })
})

describe('the service worker on a tap', () => {
  it("navigates an open window of the app to a url on the app's own origin, as the parser spells it", async () => {
    for (const url of [`${origin}/tasks/1`, 'https://APP.example.com:443/tasks/1']) {
      const window = appWindow()
      const worker = startWorker({ windows: [window] })
      await worker.click({ url })
      expect(window).toMatchObject({ focused: true, navigated: [`${origin}/tasks/1`] })
      expect(worker.opened).toEqual([])
    }
  })

  it('opens a window at the url when the app has none open, or none the worker can navigate', async () => {
    const none = startWorker()
    await none.click({ url: `${origin}/tasks/1` })
    expect(none.opened).toEqual([`${origin}/tasks/1`])
    const uncontrolled = startWorker({ windows: [appWindow(false)] })
    await uncontrolled.click({ url: `${origin}/tasks/1` })
    expect(uncontrolled.opened).toEqual([`${origin}/tasks/1`])
  })

  it.each([
    'https://app.example.com.evil.test/x',
    'https://app.example.com@evil.test/x',
    'https://evil.test\\@app.example.com/x',
    'https://evil.test/?next=https://app.example.com/',
    'https://app.example.com:8443/x',
    'http://app.example.com/x',
  ])('opens %s in a new window and leaves the app alone', async (url) => {
    const window = appWindow()
    const worker = startWorker({ windows: [window] })
    await worker.click({ url })
    expect(worker.opened).toEqual([new URL(url).href])
    expect(window).toMatchObject({ focused: false, navigated: [] })
  })

  it.each([
    'data:text/html,<script>alert(1)</script>',
    `blob:${origin}/0b6e1c62-4c64-4c4c-9a3c-6c2b1e1f9a10`,
    'JavaScript:alert(1)',
    'java\tscript:alert(1)',
    ' javascript:alert(1)',
    'intent://scan/#Intent;scheme=zxing;end',
    'file:///etc/passwd',
    'about:blank',
    `view-source:${origin}/`,
    '/inbox',
    '//evil.test/',
    'https://',
    42,
    null,
    { href: `${origin}/x` },
  ])('opens and navigates nothing for %s', async (url) => {
    const window = appWindow()
    const worker = startWorker({ windows: [window] })
    await worker.click({ url })
    expect(worker.opened).toEqual([])
    expect(window).toMatchObject({ focused: false, navigated: [] })
  })

  it('opens nothing for a notification without data, as page code may show one', async () => {
    const worker = startWorker({ windows: [appWindow()] })
    await worker.click(undefined)
    await worker.click(null)
    expect(worker.opened).toEqual([])
  })

  it('needs no URL.canParse, which older workers lack', async () => {
    const NoCanParse = class extends URL {}
    Object.defineProperty(NoCanParse, 'canParse', { value: undefined })
    const window = appWindow()
    const worker = startWorker({ windows: [window], UrlClass: NoCanParse as typeof URL })
    await worker.click({ url: 'javascript:alert(1)' })
    await worker.click({ url: `${origin}/tasks/1` })
    expect(worker.opened).toEqual([])
    expect(window.navigated).toEqual([`${origin}/tasks/1`])
  })
})

describe('the workers', () => {
  it('carry the push handlers in the shell and in development, and no key or environment', () => {
    const shell = serviceWorkerCode({ version: '1', precache: ['/index.html'] })
    for (const code of [shell, devServiceWorkerCode]) {
      expect(code).toContain(pushHandlersCode)
      expect(code).not.toMatch(/PROTOBASE_|VAPID|process\.env|privateKey/i)
    }
  })

  it('has the development worker take over open pages and cache nothing', async () => {
    const worker = startWorker({ code: devServiceWorkerCode, record: alice })
    await worker.push({ title: 'Hi', user: 'alice' })
    expect(worker.shown).toHaveLength(1)
    expect(devServiceWorkerCode).not.toContain('caches')
  })
})
