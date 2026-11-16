import { Kysely } from 'kysely'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createUser } from '../src/better-auth/users'
import { cookiesOf, octo, origin, password, servePlatformApp } from './support/platform-sign-in-app'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// Token sign-in alone: the platform's provider without a client secret, as for an app the provider issues ID tokens
// for by its origin. The token's audience is the app's origin, and nobody is sent through the provider's pages.

let shared: SnapshotDb
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await openSnapshotDb('auth')
  appDb = new Kysely<any>({ dialect: shared.dialect })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

let tokens = 0
const claims = () => octo({ jti: `token-${++tokens}` })

describe('token sign-in alone', () => {
  it("signs in with a token for the app's own origin, and refuses one for another audience", async () => {
    const { auth, platform, request } = await servePlatformApp(shared, appDb, { tokensOnly: true })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const post = async (audience: string) => request('/sign-in/social', { body: { provider: 'github', idToken: { token: await platform.idToken(claims(), { audience }) } } })
    const signedIn = await post(origin)
    expect(signedIn.status, await signedIn.clone().text()).toBe(200)
    expect(await signedIn.json()).toMatchObject({ user: { email: 'octo@example.com' } })
    const refused = await post('https://other.example.app')
    expect(refused.status).toBe(401)
    expect(await refused.json()).toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it("never sends anyone through the provider's pages, nor offers them", async () => {
    const { request, signIn } = await servePlatformApp(shared, appDb, { tokensOnly: true })
    const refused = await request('/sign-in/social', { body: { provider: 'github', callbackURL: `${origin}/` } })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'PROVIDER_PAGES_OFF' })
    expect(cookiesOf(refused).filter((cookie) => cookie.includes('state'))).toEqual([])
    const linking = await request('/link-social', { cookie: await signIn('root@example.com'), body: { provider: 'github', callbackURL: `${origin}/` } })
    expect(linking.status).toBe(403)
    const status = (await (await request('/status')).json()) as { socialProviders: string[]; platformSignIn?: unknown }
    expect(status.socialProviders).not.toContain('github')
    expect(status.platformSignIn).toBeUndefined()
  })
})
