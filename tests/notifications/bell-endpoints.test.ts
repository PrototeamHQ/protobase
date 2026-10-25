import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '../../packages/client/src/client'
import { createAdmin } from '../../packages/server/src/create-admin'
import { memoryHistoryStore } from '../../packages/server/src/notifications/testing/memory-history-store'
import { memoryDeviceStore } from '../../packages/server/src/notifications/testing/memory-store'
import type { Authenticator } from '../../packages/server/src/types'

// The stores are in memory, so the app sends nothing to a database.
const db = new Kysely<unknown>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (kysely) => new PostgresIntrospector(kysely),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
})

// Whoever the bearer token names, signed in as themselves, as an app's own authenticate marks it.
const authenticate: Authenticator = (request) => {
  const user = request.headers.get('authorization')?.replace('Bearer ', '') ?? ''
  return { user: { id: user, roles: ['user'] }, signIn: { session: `session-${user}`, staff: false } }
}

describe("the bell's calls on a running app", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("list, count and mark read the caller's own inbox, through the client, the API's auth and the routes", async () => {
    const history = memoryHistoryStore()
    const admin = createAdmin({ resources: [], db, authenticate, notifications: { store: memoryDeviceStore(), historyStore: history } })
    const clientOf = (user: string) => createClient({ baseUrl: 'http://app.test/api/v1', token: async () => user, fetch: ((input: RequestInfo | URL, init?: RequestInit) => admin.request(String(input), init)) as typeof fetch })
    // A minute apart, so the newest comes first whatever the ids
    vi.useFakeTimers({ toFake: ['Date'] })
    for (const [minute, title] of ['First', 'Second', 'Third'].entries()) {
      vi.setSystemTime(Date.UTC(2026, 6, 1, 0, minute))
      await history.record('alice', { title, body: null, url: '/tasks/1', data: null })
    }
    await history.record('bob', { title: "Bob's", body: null, url: null, data: null })

    const alice = clientOf('alice').notifications
    expect(await alice.unread()).toBe(3)
    const first = await alice.list({ limit: 2 })
    expect(first.items.map((item) => item.title)).toEqual(['Third', 'Second'])
    expect(first.items[0]).toEqual({ id: expect.any(String), title: 'Third', body: null, url: '/tasks/1', data: null, createdAt: expect.any(String), readAt: null })
    const rest = await alice.list({ cursor: first.next! })
    expect(rest).toEqual({ items: [expect.objectContaining({ title: 'First' })], next: null })

    await alice.markRead(first.items[0]!.id)
    expect(await alice.unread()).toBe(2)
    await alice.markAllRead(first.items[0]!.createdAt)
    expect(await alice.unread()).toBe(0)
    expect(await clientOf('bob').notifications.unread()).toBe(1)
  })
})
