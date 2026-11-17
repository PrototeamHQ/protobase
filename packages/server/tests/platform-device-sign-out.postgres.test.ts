import { sql } from 'kysely'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authSchemaMigration } from '../src/better-auth/auth-schema'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'
import { startFakeOidcProvider } from './support/fake-oidc-provider'
import { client, cookiesOf, issuer, octo, origin, password } from './support/platform-sign-in-app'

// Real Postgres, as a device's sessions here are more than one query's bind parameters could ever name, and more than
// a recording should hold.
const ready = (await postgresTemplateReady('auth')) && (await postgresTemplateReady('empty'))

afterEach(() => {
  vi.unstubAllGlobals()
})

// More sessions than the 65,535 bind parameters one Postgres query takes, so no read of their ids could name them all.
const sessionCount = 70_000

// An app with a provider of devices on a copy of `template`, its store migrated by the auth migration when it is empty.
const serve = async (template: 'auth' | 'empty', options: Partial<CreateAuthOptions> = {}) => {
  const platform = await startFakeOidcProvider({ issuer, client })
  const store = await openPostgresDatabase(template)
  const auth = createAuth({
    database: { dialect: store.dialect, type: 'postgres' },
    baseURL: origin,
    secret: 'test-secret-test-secret-test-secret-1234',
    mailer: false,
    operator: false,
    signInProviders: [{ issuer, clientId: client.clientId, provider: 'central', tokenSignIn: true, devices: true }],
    ...options,
  })
  if (template === 'empty') await store.exec((await authSchemaMigration(auth))!)
  await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
  const app = createAdmin({ resources: [], db: store.db, authenticate: betterAuthAuthenticator({ auth }), auth })
  const request = (path: string, body: unknown, cookie?: string) =>
    app.request(`${origin}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...(cookie && { cookie }) }, body: JSON.stringify(body) })
  const postToken = async (sub: string) => request('/sign-in/social', { provider: 'central', idToken: { token: await platform.idToken(octo({ sub, jti: sub })) } })
  const signIn = async () => cookiesOf(await request('/sign-in/email', { email: 'octo@example.com', password })).join('; ')
  const deviceLinks = async (cookie: string) => (await (await app.request(`${origin}/api/auth/account/device-links`, { headers: { origin, cookie } })).json()).links as { id: string; sessions: string[] }[]
  return { store, app, request, postToken, signIn, deviceLinks }
}

describe.skipIf(!ready)('signing a device out', () => {
  it('ends every session it began, however many, and no other', async () => {
    const { store, app, request, postToken, signIn, deviceLinks } = await serve('auth')
    expect((await postToken('device-1')).status).toBe(200)
    expect((await postToken('device-2')).status).toBe(200)

    // The first device's sessions, past any read of their ids: copies of the one its sign-in began.
    await store.exec(`
      with device as (select a.id as account_id, s.user_id, s.expires_at from account a join device_session d on d.account_id = a.id join session s on s.id = d.session_id where a.account_id = 'device-1'),
      made as (
        insert into session (id, token, user_id, expires_at, updated_at)
        select 'bulk-' || n, 'bulk-token-' || n, device.user_id, device.expires_at, now() from device, generate_series(1, ${sessionCount}) n
        returning id
      )
      insert into device_session (id, session_id, account_id, created_at) select 'bulk-' || made.id, made.id, device.account_id, now() from made, device`)
    const count = async (query: string) => Number((await sql<{ n: string }>`${sql.raw(query)}`.execute(store.db)).rows[0]!.n)
    expect(await count(`select count(*) as n from device_session d join account a on a.id = d.account_id where a.account_id = 'device-1'`)).toBe(sessionCount + 1)

    const cookie = await signIn()
    const link = (await deviceLinks(cookie)).find((found) => found.sessions.length > 1)!
    expect(link.sessions).toHaveLength(sessionCount + 1)
    expect((await request('/account/device-links/sign-out', { id: link.id }, cookie)).status).toBe(200)

    expect(await count(`select count(*) as n from session where token like 'bulk-token-%'`)).toBe(0)
    expect(await count(`select count(*) as n from device_session d join account a on a.id = d.account_id where a.account_id = 'device-1'`)).toBe(0)
    // The other device's session, and the person's own, stand.
    expect(await count(`select count(*) as n from device_session d join account a on a.id = d.account_id where a.account_id = 'device-2'`)).toBe(1)
    expect((await app.request(`${origin}/api/auth/get-session`, { headers: { origin, cookie } })).status).toBe(200)
    expect(await (await app.request(`${origin}/api/auth/get-session`, { headers: { origin, cookie } })).json()).toMatchObject({ user: { email: 'octo@example.com' } })
  }, 120_000)

  it('lists and signs out a device in a store whose ids are uuids', async () => {
    const { app, postToken, signIn, deviceLinks, request } = await serve('empty', { generateUserId: 'uuid' })
    const phone = cookiesOf(await postToken('device-1')).join('; ')
    const cookie = await signIn()
    const links = await deviceLinks(cookie)
    expect(links).toMatchObject([{ sessions: [expect.any(String)] }])
    expect((await request('/account/device-links/sign-out', { id: links[0]!.id }, cookie)).status).toBe(200)
    expect(await (await app.request(`${origin}/api/auth/get-session`, { headers: { origin, cookie: phone } })).json()).toBeNull()
    expect(await deviceLinks(cookie)).toEqual([])
  })
})
