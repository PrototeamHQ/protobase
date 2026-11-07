import { describe, expect, it, vi } from 'vitest'
import { setUserBanned } from '../src/better-auth/users'
import type { MailMessage } from '../src/mail/smtp-mailer'
import { browser, fcm, origin, password, pushTo, serve } from './support/notifications-app'
import { sessionCookie } from './support/session-token'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

// The session token a cookie header carries, whose value is `token.signature`.
const tokenIn = (cookie: string) => decodeURIComponent(cookie.split('; ').find((part) => part.startsWith(`${sessionCookie}=`))!.slice(sessionCookie.length + 1)).split('.')[0]!

const recordingMailer = () => {
  const sent: MailMessage[] = []
  const last = async (to: string) => {
    await expect.poll(() => sent.some((message) => message.to === to), { timeout: 10_000 }).toBe(true)
    return sent.findLast((message) => message.to === to)!.text
  }
  return { last, mailer: { send: async (message: MailMessage) => void sent.push(message) } }
}

// Alice signed in on two browsers, each registered in its own session, and Bob on one: each gets push to begin with.
const signedIn = async (served: Awaited<ReturnType<typeof serve>>) => {
  const { alice, bob, app, cookieOf, register } = served
  const bearerOf = async (cookie: string) => ((await (await app.request(`${origin}/api/auth/token`, { headers: { cookie, origin } })).json()) as { token: string }).token
  const first = await cookieOf('alice@example.com')
  const second = await cookieOf('alice@example.com')
  const bobs = await cookieOf('bob@example.com')
  for (const [cookie, name] of [[first, 'alice-1'], [second, 'alice-2'], [bobs, 'bob-1']] as const) expect((await register(await bearerOf(cookie), browser(name))).status).toBe(200)
  expect(await pushTo(served, alice.id)).toEqual(['alice-1', 'alice-2'])
  expect(await pushTo(served, bob.id)).toEqual(['bob-1'])
  return { first, second, bobs, bearerOf }
}

const endpoints = async (served: Awaited<ReturnType<typeof serve>>, userId: string) => (await served.devicesOf(userId)).map(({ token }) => token.slice(token.lastIndexOf('/') + 1))

// After a session ends: Alice's devices left get push, the ended ones are removed, and Bob's are untouched.
const expectLeft = async (served: Awaited<ReturnType<typeof serve>>, left: string[]) => {
  expect(await pushTo(served, served.alice.id)).toEqual(left)
  expect(await endpoints(served, served.alice.id)).toEqual(left)
  expect(await pushTo(served, served.bob.id)).toEqual(['bob-1'])
}

describe('a device with auth, once the session it was registered in ends', () => {
  it('gets no push and is removed when that one session is revoked, the other browser kept', async () => {
    const served = await serve()
    const { first, second } = await signedIn(served)
    expect((await served.post('/api/auth/revoke-session', { token: tokenIn(first) }, { cookie: second })).status).toBe(200)
    await expectLeft(served, ['alice-2'])
  })

  it('gets no push and is removed when the user revokes all their sessions', async () => {
    const served = await serve()
    const { first } = await signedIn(served)
    expect((await served.post('/api/auth/revoke-sessions', {}, { cookie: first })).status).toBe(200)
    await expectLeft(served, [])
  })

  it("keeps the calling browser's device and removes the others' when the user revokes their other sessions", async () => {
    const served = await serve()
    const { second } = await signedIn(served)
    expect((await served.post('/api/auth/revoke-other-sessions', {}, { cookie: second })).status).toBe(200)
    await expectLeft(served, ['alice-2'])
  })

  it('gets no push and is removed once the session expires, while its row still stands', async () => {
    const served = await serve()
    const { first } = await signedIn(served)
    await served.pg.query(`update "session" set expires_at = '2026-07-01T00:00:00Z' where token = $1`, [tokenIn(first)])
    await expectLeft(served, ['alice-2'])
  })

  it('gets no push and is removed when an admin bans the user, from the CLI and over HTTP', async () => {
    const byCli = await serve()
    await signedIn(byCli)
    await setUserBanned(byCli.auth, { email: 'alice@example.com', banned: true })
    await expectLeft(byCli, [])

    const byHttp = await serve()
    await signedIn(byHttp)
    const admin = await byHttp.cookieOf('root@example.com')
    expect((await byHttp.post('/api/auth/admin/ban-user', { userId: byHttp.alice.id }, { cookie: admin })).status).toBe(200)
    await expectLeft(byHttp, [])
  })

  it('gets no push and is removed when the user is banned without their sessions ending', async () => {
    const served = await serve()
    await signedIn(served)
    const admin = await served.cookieOf('root@example.com')
    expect((await served.post('/api/auth/admin/update-user', { userId: served.alice.id, data: { banned: true } }, { cookie: admin })).status).toBe(200)
    expect((await served.pg.query('select count(*)::int as count from "session" where user_id = $1', [served.alice.id])).rows).toEqual([{ count: 2 }])
    await expectLeft(served, [])
  })

  it('gets no push and is removed when a password reset ends the sessions', async () => {
    const { mailer, last } = recordingMailer()
    const served = await serve({ mailer })
    await signedIn(served)
    expect((await served.post('/api/auth/request-password-reset', { email: 'alice@example.com', redirectTo: `${origin}/` })).status).toBe(200)
    const token = /reset-password\/([^?\s"]+)/.exec(await last('alice@example.com'))![1]!
    expect((await served.post('/api/auth/reset-password', { newPassword: `${password} again`, token })).status).toBe(200)
    await expectLeft(served, [])
  })

  it('gets no push and is removed when it has no session recorded, as one registered before devices kept theirs', async () => {
    const served = await serve()
    await signedIn(served)
    await served.pg.query(`update notifications.devices set session_id = null where token like '%/alice-1'`)
    await expectLeft(served, ['alice-2'])
  })

  it('gets push again once its user signs in again and the browser registers it in the new session', async () => {
    const served = await serve()
    const { first, bearerOf } = await signedIn(served)
    expect((await served.post('/api/auth/sign-out', {}, { cookie: first })).status).toBe(200)
    await expectLeft(served, ['alice-2'])
    const again = await served.cookieOf('alice@example.com')
    expect((await served.register(await bearerOf(again), browser('alice-1'))).status).toBe(200)
    await expectLeft(served, ['alice-1', 'alice-2'])
    const { rows } = await served.pg.query(`select s.token from notifications.devices d join "session" s on s.id = d.session_id where d.token like '%/alice-1'`)
    expect(rows).toEqual([{ token: tokenIn(again) }])
  })

  it("follows a phone's token to whoever registers it last, and ends only with that user's session", async () => {
    const served = await serve()
    const { first, bobs, bearerOf } = await signedIn(served)
    expect((await served.register(await bearerOf(first), fcm('shared-phone'))).status).toBe(200)
    expect((await served.register(await bearerOf(bobs), fcm('shared-phone'))).status).toBe(200)
    expect(await pushTo(served, served.alice.id)).toEqual(['alice-1', 'alice-2'])
    expect((await served.post('/api/auth/sign-out', {}, { cookie: first })).status).toBe(200)
    expect(await pushTo(served, served.alice.id)).toEqual(['alice-2'])
    expect(await pushTo(served, served.bob.id)).toEqual(['bob-1', 'shared-phone'])
  })
})
