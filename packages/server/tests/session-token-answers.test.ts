import { Kysely } from 'kysely'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { softwarePasskey } from './support/software-passkey'
import { expectNoneOf, expectNoSessionToken, sessionCookie, sessionTokenOf } from './support/session-token'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

// Page script holds the session cookie at most, never the long-lived session token: no answer under /api/auth carries it.
const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'
const admin = 'root@example.com'
const member = 'pat@example.com'

let shared: SnapshotDb
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await openSnapshotDb('auth')
  appDb = new Kysely<any>({ dialect: shared.dialect })
})

const serve = async () => {
  const store = await shared.clone()
  const auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret, roles: ['admin', 'member'] })
  await createUser(auth, { email: admin, password })
  await createUser(auth, { email: member, password, role: 'member' })
  const app = createAdmin({ resources: [], db: appDb, authenticate: betterAuthAuthenticator({ auth }), auth })
  return { auth, app }
}

type Served = Awaited<ReturnType<typeof serve>>

// Better Auth limits sign-ins per client address; every request here comes from a new one.
let client = 0
const call = ({ app }: Served, path: string, { cookie = '', body, accept }: { cookie?: string; body?: unknown; accept?: string } = {}) =>
  app.request(`${origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { origin, cookie, 'x-forwarded-for': `198.51.100.${++client}`, ...(body !== undefined && { 'content-type': 'application/json' }), ...(accept && { accept }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

// The cookies a browser keeps from a response; a cookie the response clears is left out.
const cookiesOf = (response: Response) =>
  response.headers.getSetCookie().map((line) => line.split(';')[0]!).filter((pair) => !pair.endsWith('=')).join('; ')

const signIn = async (served: Served, email: string) => {
  const response = await call(served, '/api/auth/sign-in/email', { body: { email, password } })
  expect(response.status).toBe(200)
  return { response, token: sessionTokenOf(response), cookie: cookiesOf(response) }
}

const signInWithPasskey = async (served: Served, email: string) => {
  const key = softwarePasskey()
  const { adapter } = await served.auth.$context
  const user = await adapter.findOne<{ id: string }>({ model: 'user', where: [{ field: 'email', value: email }] })
  await adapter.create({ model: 'passkey', data: { userId: user!.id, credentialID: key.id, publicKey: key.publicKey, counter: 0, deviceType: 'singleDevice', backedUp: false, transports: 'internal', createdAt: new Date() } })
  const options = await call(served, '/api/auth/passkey/generate-authenticate-options')
  const { challenge } = (await options.json()) as { challenge: string }
  const response = await call(served, '/api/auth/passkey/verify-authentication', { cookie: cookiesOf(options), body: { response: key.answer({ challenge, rpId: 'localhost', origin }) } })
  expect(response.status).toBe(200)
  return response
}

const sessionOf = async (served: Served, cookie: string) => (await call(served, '/api/auth/get-session', { cookie })).json()

describe('the answers under /api/auth', () => {
  it('carry no session token from a sign-in, the sessions or the admin list of them', async () => {
    const served = await serve()
    const signedIn = await signIn(served, member)
    const byPassword = await expectNoSessionToken(signedIn.response)
    const byPasskey = await expectNoSessionToken(await signInWithPasskey(served, member))
    const { cookie } = await signIn(served, admin)
    const memberCookie = signedIn.cookie
    const memberTokens = [byPassword, byPasskey]

    const session = await call(served, '/api/auth/get-session', { cookie: memberCookie })
    await expectNoneOf(session, memberTokens)
    expect(await session.clone().text()).not.toContain('"token"')
    const { session: current, user } = await session.json()
    expect(current.id).toEqual(expect.any(String))
    expect(user.email).toBe(member)

    const sessions = await call(served, '/api/auth/list-sessions', { cookie: memberCookie })
    await expectNoneOf(sessions, memberTokens)
    expect(await sessions.clone().text()).not.toContain('"token"')
    const listed = (await sessions.json()) as { id: string }[]
    expect(listed.map((item) => item.id)).toEqual([expect.any(String), expect.any(String)])

    const userSessions = await call(served, '/api/auth/admin/list-user-sessions', { cookie, body: { userId: user.id } })
    expect(userSessions.status).toBe(200)
    await expectNoneOf(userSessions, memberTokens)
    expect(((await userSessions.json()) as { sessions: unknown[] }).sessions).toHaveLength(2)
  })

  it("keep /token's short-lived JWT, at that exact address only", async () => {
    const served = await serve()
    const { token, cookie } = await signIn(served, member)

    const answer = await call(served, '/api/auth/token', { cookie })
    await expectNoneOf(answer, [token])
    const { token: jwt } = (await answer.json()) as { token: string }
    const [, payload = ''] = jwt.split('.')
    expect(jwt.split('.')).toHaveLength(3)
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
    expect(JSON.stringify(claims)).not.toContain(token)
    expect(claims.exp - claims.iat).toBe(15 * 60)
    const { session } = await sessionOf(served, cookie)
    expect(Date.parse(session.expiresAt) - Date.now()).toBeGreaterThan(24 * 60 * 60 * 1000)

    for (const path of ['/api/auth/get-session?next=/api/auth/token', '/api/auth/list-sessions?x=/token']) {
      const steered = await call(served, path, { cookie })
      expect(steered.status).toBe(200)
      await expectNoneOf(steered, [token])
      expect(await steered.text()).not.toContain('"token"')
    }
    await expectNoneOf(await call(served, '/api/auth/token', { cookie, body: {} }), [token])
    expect(await (await call(served, '/api/auth/token?x=1', { cookie })).json()).toEqual({ token: expect.any(String) })
  })

  it('carry no session token from any GET endpoint, for a member or an admin', async () => {
    const served = await serve()
    // Every GET endpoint Better Auth serves, path parameters filled in, and the status route mounted before them.
    const paths = Object.values(served.auth.api).flatMap((endpoint) => {
      const { path, options } = endpoint as { path?: string; options?: { method?: string | string[] } }
      const methods = [options?.method ?? []].flat()
      return path && (methods.includes('GET') || methods.includes('*')) ? [`/api/auth${path.replaceAll(/:\w+/g, 'x')}`] : []
    })
    expect(paths).toEqual(expect.arrayContaining(['/api/auth/get-session', '/api/auth/list-sessions', '/api/auth/token']))
    // Once with a browser's page Accept, once with none: each answer's own type, whatever the client asked for.
    for (const [email, accept] of [[member, undefined], [admin, 'text/html']] as const) {
      const { token, cookie } = await signIn(served, email)
      for (const path of [...new Set(paths), '/api/auth/status']) await expectNoneOf(await call(served, path, { cookie, ...(accept && { accept }) }), [token])
      expect(await sessionOf(served, cookie)).not.toBeNull()
    }
  })

  it('carry no session token when a password change signs the other devices out', async () => {
    const served = await serve()
    const first = await signIn(served, member)
    const second = await signIn(served, member)

    expect((await call(served, '/api/auth/revoke-other-sessions', { cookie: first.cookie, body: {} })).status).toBe(200)
    expect(await sessionOf(served, second.cookie)).toBeNull()
    expect(await sessionOf(served, first.cookie)).not.toBeNull()

    const third = await signIn(served, member)
    const changed = await call(served, '/api/auth/change-password', { cookie: first.cookie, body: { currentPassword: password, newPassword: 'another correct horse', revokeOtherSessions: true } })
    expect(changed.status).toBe(200)
    const renewed = await expectNoSessionToken(changed)
    expect(renewed).not.toBe(first.token)
    await expectNoneOf(changed, [first.token, third.token])
    expect(await sessionOf(served, third.cookie)).toBeNull()

    const signedOut = await call(served, '/api/auth/sign-out', { cookie: cookiesOf(changed), body: {} })
    expect(signedOut.status).toBe(200)
    expect(signedOut.headers.getSetCookie().some((line) => line.startsWith(`${sessionCookie}=;`) && /max-age=0/i.test(line))).toBe(true)
    expect(await sessionOf(served, cookiesOf(changed))).toBeNull()
  })
})

describe("GoTrue's endpoints for page script with only the session cookie", () => {
  it('answer no refresh token, and take no session id for one', async () => {
    const served = await serve()
    const { token, cookie } = await signIn(served, member)
    const [{ id }] = (await (await call(served, '/api/auth/list-sessions', { cookie })).json()) as [{ id: string }]

    const answers = [
      await call(served, '/api/sb/auth/v1/user', { cookie }),
      await call(served, `/api/sb/auth/v1/callback?redirect_to=${encodeURIComponent(origin)}`, { cookie }),
      await call(served, '/api/sb/auth/v1/token?grant_type=refresh_token', { cookie, body: {} }),
      await call(served, '/api/sb/auth/v1/token?grant_type=pkce', { cookie, body: {} }),
      await call(served, '/api/sb/auth/v1/logout', { cookie, body: {} }),
    ]
    for (const answer of answers) {
      await expectNoneOf(answer, [token])
      expect(await answer.text()).not.toContain('"refresh_token"')
      expect(answer.headers.get('location') ?? '').not.toContain('refresh_token')
    }

    const byId = await call(served, '/api/sb/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: id } })
    expect(byId.status).toBe(400)
    expect(await byId.text()).not.toContain('access_token')
    expect(await sessionOf(served, `${sessionCookie}=${id}`)).toBeNull()
    expect(await sessionOf(served, cookie)).not.toBeNull()
  })
})
