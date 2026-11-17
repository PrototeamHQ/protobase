import { sql } from 'kysely'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'
import { startFakeOidcProvider } from './support/fake-oidc-provider'
import { client, cookiesOf, issuer, octo, origin, password } from './support/platform-sign-in-app'

// Real Postgres, as a device's sessions here are more than one query's bind parameters could ever name, and more than
// a recording should hold.
const ready = await postgresTemplateReady('auth')

afterEach(() => {
  vi.unstubAllGlobals()
})

// More sessions than the 65,535 bind parameters one Postgres query takes, so no read of their ids could name them all.
const sessionCount = 70_000

describe.skipIf(!ready)('signing a device out', () => {
  it('ends every session it began, however many, and no other', async () => {
    const platform = await startFakeOidcProvider({ issuer, client })
    const store = await openPostgresDatabase('auth')
    const auth = createAuth({
      database: { dialect: store.dialect, type: 'postgres' },
      baseURL: origin,
      secret: 'test-secret-test-secret-test-secret-1234',
      mailer: false,
      operator: false,
      signInProviders: [{ issuer, clientId: client.clientId, provider: 'central', tokenSignIn: true, devices: true }],
    })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const app = createAdmin({ resources: [], db: store.db, authenticate: betterAuthAuthenticator({ auth }), auth })
    const request = (path: string, body: unknown, cookie?: string) =>
      app.request(`${origin}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...(cookie && { cookie }) }, body: JSON.stringify(body) })
    const postToken = async (sub: string) => request('/sign-in/social', { provider: 'central', idToken: { token: await platform.idToken(octo({ sub, jti: sub })) } })
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

    const signedIn = await request('/sign-in/email', { email: 'octo@example.com', password })
    const cookie = cookiesOf(signedIn).join('; ')
    const [link] = (await (await app.request(`${origin}/api/auth/account/device-links`, { headers: { origin, cookie } })).json()).links.filter((found: { sessions: string[] }) => found.sessions.length > 1)
    expect(link.sessions).toHaveLength(sessionCount + 1)
    expect((await request('/account/device-links/sign-out', { id: link.id }, cookie)).status).toBe(200)

    expect(await count(`select count(*) as n from session where token like 'bulk-token-%'`)).toBe(0)
    expect(await count(`select count(*) as n from device_session d join account a on a.id = d.account_id where a.account_id = 'device-1'`)).toBe(0)
    // The other device's session, and the person's own, stand.
    expect(await count(`select count(*) as n from device_session d join account a on a.id = d.account_id where a.account_id = 'device-2'`)).toBe(1)
    expect((await app.request(`${origin}/api/auth/get-session`, { headers: { origin, cookie } })).status).toBe(200)
    expect(await (await app.request(`${origin}/api/auth/get-session`, { headers: { origin, cookie } })).json()).toMatchObject({ user: { email: 'octo@example.com' } })
  }, 120_000)
})
