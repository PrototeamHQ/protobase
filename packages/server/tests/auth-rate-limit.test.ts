import { Kysely } from 'kysely'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'

let app: ReturnType<typeof createAdmin>
beforeAll(async () => {
  const store = await openSnapshotDb('auth')
  const auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret, mailer: false })
  await createUser(auth, { email: 'root@example.com', password })
  app = createAdmin({ resources: [], db: new Kysely<any>({ dialect: store.dialect }), authenticate: betterAuthAuthenticator({ auth }), auth })
}, 60_000)

// The client address the proxy in front names in X-Forwarded-For, or none.
const request = (path: string, { client, cookie, body }: { client?: string; cookie?: string; body?: unknown } = {}) =>
  app.request(`${origin}/api/auth${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', origin, ...(client && { 'x-forwarded-for': client }), ...(cookie && { cookie }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

// What the admin app reads on every page load: the session and the role it acts with, each twice, and its token.
const pageLoad = async (client?: string, cookie?: string) => {
  const answers = []
  for (const path of ['/get-session', '/get-session', '/role/current', '/role/current', '/token']) answers.push((await request(path, { client, cookie })).status)
  return answers
}

const signIn = (client: string, attempt = password) => request('/sign-in/email', { client, body: { email: 'root@example.com', password: attempt } })

const failedSignIns = async (client: string, count: number) => {
  const answers = []
  for (let attempt = 0; attempt < count; attempt++) answers.push((await signIn(client, 'wrong password')).status)
  return answers
}

describe('the auth rate limit', () => {
  it('refuses none of the session, role and token reads of 200 page loads in a minute, and leaves the session its role', async () => {
    const answers = []
    for (let load = 0; load < 200; load++) answers.push(...(await pageLoad('198.51.100.1')))
    expect(answers.filter((status) => status === 429)).toEqual([])
    const cookie = (await signIn('198.51.100.1')).headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
    expect(await pageLoad('198.51.100.1', cookie)).toEqual([200, 200, 200, 200, 200])
    expect(await (await request('/role/current', { client: '198.51.100.1', cookie })).json()).toMatchObject({ active: 'admin' })
  })

  it('refuses no page load of visitors without a client address, who would share one limit', async () => {
    const answers = []
    for (let load = 0; load < 200; load++) answers.push(...(await pageLoad()))
    expect(answers.filter((status) => status === 429)).toEqual([])
  })

  it('still refuses repeated failed sign-ins from one client', async () => {
    expect(await failedSignIns('198.51.100.2', 6)).toEqual([401, 401, 401, 401, 401, 429])
  })

  it('counts each client the proxy names on its own', async () => {
    expect((await failedSignIns('198.51.100.3', 6)).at(-1)).toBe(429)
    expect(await failedSignIns('198.51.100.4', 1)).toEqual([401])
  })
})
