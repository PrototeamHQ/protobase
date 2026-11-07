import { describe, expect, it, vi } from 'vitest'
import { issueToken } from '../src/better-auth/tokens'
import { deleteUser } from '../src/better-auth/users'
import type { HistoryStore } from '../src/notifications/history-store'
import { historyPath } from '../src/notifications/paths'
import { postgresHistoryStore } from '../src/notifications/postgres-history-store'
import { checkNotificationsSchema } from '../src/notifications/schema'
import { memoryHistoryStore } from '../src/notifications/testing/memory-history-store'
import { origin, serve } from './support/notifications-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

describe('the history with auth', () => {
  const upTo = { upTo: '2030-01-01T00:00:00.000Z' }
  const historyOf = async (pg: Awaited<ReturnType<typeof serve>>['pg'], userId: string) =>
    (await pg.query('select title, read_at from notifications.history where user_id = $1 order by title', [userId])).rows
  // Every endpoint of the history, as `headers` call it.
  const callAll = (app: Awaited<ReturnType<typeof serve>>['app'], headers: Record<string, string>, id: string) => {
    const json = { 'content-type': 'application/json', ...headers }
    return Promise.all([
      app.request(`${origin}${historyPath('/api')}`, { headers }),
      app.request(`${origin}${historyPath('/api', 'unread')}`, { headers }),
      app.request(`${origin}${historyPath('/api', { read: id })}`, { method: 'POST', headers: json, body: '{}' }),
      app.request(`${origin}${historyPath('/api', 'read')}`, { method: 'POST', headers: json, body: JSON.stringify(upTo) }),
    ])
  }

  it("goes with its user, keeping everyone else's, and stops startup without that foreign key", async () => {
    const { pg, auth, alice, bob } = await serve()
    const history = postgresHistoryStore(pg.db)
    await history.record(alice.id, { title: 'Alice', body: null, url: null, data: null })
    await history.record(bob.id, { title: 'Bob', body: null, url: null, data: null })
    await deleteUser(auth, 'alice@example.com')
    expect(await historyOf(pg, alice.id)).toEqual([])
    expect(await historyOf(pg, bob.id)).toEqual([{ title: 'Bob', read_at: null }])
    await pg.exec('alter table notifications.history drop constraint history_user_id_fkey')
    await expect(checkNotificationsSchema(pg.db, {}, auth)).rejects.toThrow('The history table "notifications"."history" needs a foreign key from "user_id" to "user" with on delete cascade')
  })

  it("serves the signed-in user's own, and refuses a signed-out token, a cookie alone and an issued token, changing nothing", async () => {
    const { pg, app, auth, alice, cookieOf, tokenOf, post } = await serve()
    const entry = await postgresHistoryStore(pg.db).record(alice.id, { title: 'Alice', body: null, url: '/tasks/1', data: null })
    const token = await tokenOf('alice@example.com')
    const bearer = { authorization: `Bearer ${token}`, origin }
    const listed = await (await app.request(`${origin}${historyPath('/api')}`, { headers: bearer })).json()
    expect(listed.items).toEqual([expect.objectContaining({ id: entry.id, title: 'Alice', url: '/tasks/1', readAt: null })])
    // A foreign page's request gets nothing a browser would let it read.
    const foreign = await app.request(`${origin}${historyPath('/api', 'unread')}`, { headers: { ...bearer, origin: 'https://evil.example' } })
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull()
    expect(foreign.headers.get('access-control-allow-credentials')).toBeNull()

    const cookie = await cookieOf('alice@example.com')
    for (const answer of await callAll(app, { cookie, origin }, entry.id)) expect(answer.status).toBe(401)
    const issued = await issueToken(auth, { email: 'alice@example.com' })
    for (const answer of await callAll(app, { authorization: `Bearer ${issued.token}`, origin }, entry.id)) expect(answer.status).toBe(403)
    // A token of a session that has signed out since.
    const signedOut = ((await (await app.request(`${origin}/api/auth/token`, { headers: { cookie, origin } })).json()) as { token: string }).token
    expect((await post('/api/auth/sign-out', {}, { cookie })).status).toBe(200)
    for (const answer of await callAll(app, { authorization: `Bearer ${signedOut}`, origin }, entry.id)) expect(answer.status).toBe(401)
    expect(await historyOf(pg, alice.id)).toEqual([{ title: 'Alice', read_at: null }])
  })
})

describe('deleting a user with a history store of the app own', () => {
  it("removes exactly the user's history, and keeps the user when the store fails", async () => {
    const memory = memoryHistoryStore()
    let fail = false
    const historyStore: HistoryStore = {
      ...memory,
      removeAllForUser: async (userId) => {
        if (fail) throw new Error('the history store is down')
        await memory.removeAllForUser(userId)
      },
    }
    const { pg, auth, alice, bob } = await serve({ historyStore })
    await memory.record(alice.id, { title: 'Alice', body: null, url: null, data: null })
    await memory.record(bob.id, { title: 'Bob', body: null, url: null, data: null })
    await deleteUser(auth, 'alice@example.com')
    expect([...memory.entries.values()].map((entry) => entry.userId)).toEqual([bob.id])

    fail = true
    await expect(deleteUser(auth, 'bob@example.com')).rejects.toThrow('the history store is down')
    expect((await pg.query<{ n: number }>('select count(*)::int as n from "user" where id = $1', [bob.id])).rows[0]!.n).toBe(1)
    expect([...memory.entries.values()].map((entry) => entry.userId)).toEqual([bob.id])
  })
})
