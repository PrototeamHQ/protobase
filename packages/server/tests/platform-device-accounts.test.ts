import { Kysely } from 'kysely'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformSignIn } from '../src/better-auth/platform-sign-in'
import { createUser } from '../src/better-auth/users'
import { authenticatorCode } from './support/vault-app'
import { cookiesOf, password, type PlatformApp } from './support/platform-sign-in-app'
import { serveTwoProviders, tokenClaims } from './support/two-platform-providers'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// A provider of the platform whose accounts are devices: one person holds one per device, each signed out for good on
// its own from the account page, its sessions with it.

let shared: SnapshotDb
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await openSnapshotDb('auth')
  appDb = new Kysely<any>({ dialect: shared.dialect })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const { reset, claims } = tokenClaims()
beforeEach(reset)

const serve = (central: Partial<PlatformSignIn> = {}, options: PlatformApp = {}) => serveTwoProviders(shared, appDb, central, options)

describe('a provider of devices', () => {
  type Links = { links: { id: string; provider: string; name: string; device?: string; sessions: string[] }[] }
  const sessionToken = (cookie: string) => decodeURIComponent(/session_token=([^;.]+)/.exec(cookie)![1]!)

  it('links each device of one person by the address, and signs each in', async () => {
    const { auth, central, request, signIn, postToken, accounts } = await serve({ devices: true })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    for (const device of ['device-1', 'device-2']) expect((await postToken('central', await central.idToken(claims({ sub: device })))).status).toBe(200)
    expect((await accounts()).map(({ accountId }) => accountId).sort()).toEqual(['device-1', 'device-2'])
    const listed = (await (await request('/list-accounts', { cookie: await signIn('octo@example.com') })).json()) as { providerId: string }[]
    expect(listed.map(({ providerId }) => providerId)).toEqual(['credential'])
  })

  it('signs one device out for good, its sessions with it, and leaves the others signed in', async () => {
    const { auth, central, request, signIn, postToken, accounts } = await serve({ devices: true })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const phone = cookiesOf(await postToken('central', await central.idToken(claims({ sub: 'device-1', device_name: "Octo's phone" })))).join('; ')
    const tablet = cookiesOf(await postToken('central', await central.idToken(claims({ sub: 'device-2' })))).join('; ')
    const cookie = await signIn('octo@example.com')
    const { links } = (await (await request('/account/device-links', { cookie })).json()) as Links
    const byDevice = new Map(links.map((link) => [link.device ?? link.id, link]))
    expect(byDevice.get("Octo's phone")).toMatchObject({ provider: 'central', name: 'Central', sessions: [sessionToken(phone)] })
    expect(links).toHaveLength(2)

    const signedOut = await request('/account/device-links/sign-out', { cookie, body: { id: byDevice.get("Octo's phone")!.id } })
    expect(signedOut.status).toBe(200)
    expect(await (await request('/get-session', { cookie: phone })).json()).toBeNull()
    expect((await (await request('/get-session', { cookie: tablet })).json()).user.email).toBe('octo@example.com')
    expect((await accounts()).map(({ accountId }) => accountId)).toEqual(['device-2'])

    const again = await postToken('central', await central.idToken(claims({ sub: 'device-1' })))
    expect(again.status).toBe(403)
    expect(await again.json()).toMatchObject({ code: 'DEVICE_SIGNED_OUT' })
    expect((await accounts()).map(({ accountId }) => accountId)).toEqual(['device-2'])
    // A new device of the same verified address links as the first ones did.
    expect((await postToken('central', await central.idToken(claims({ sub: 'device-3' })))).status).toBe(200)
    expect((await accounts()).map(({ accountId }) => accountId).sort()).toEqual(['device-2', 'device-3'])
  })

  it('notes a device sign-in that waits for the second step as the device, once the step is taken', async () => {
    const { auth, central, request, signIn, postToken } = await serve({ devices: true })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const first = await signIn('octo@example.com')
    const { totpURI } = (await (await request('/two-factor/enable', { cookie: first, body: { password } })).json()) as { totpURI: string }
    const enabled = await request('/two-factor/verify-totp', { cookie: first, body: { code: authenticatorCode(totpURI) } })
    expect(enabled.status).toBe(200)
    // Turning it on starts a session of its own in place of the first.
    const cookie = cookiesOf(enabled).join('; ')

    const challenged = await postToken('central', await central.idToken(claims({ sub: 'device-1' })))
    expect(await challenged.json()).toMatchObject({ twoFactorRedirect: true })
    const verified = await request('/two-factor/verify-totp', { cookie: cookiesOf(challenged).join('; '), body: { code: authenticatorCode(totpURI) } })
    expect(verified.status).toBe(200)
    const phone = cookiesOf(verified).join('; ')
    const { links } = (await (await request('/account/device-links', { cookie })).json()) as Links
    expect(links).toMatchObject([{ sessions: [sessionToken(phone)] }])

    expect((await request('/account/device-links/sign-out', { cookie, body: { id: links[0]!.id } })).status).toBe(200)
    expect(await (await request('/get-session', { cookie: phone })).json()).toBeNull()
  })

  it('takes a sign-out that stopped half way again, and finishes it', async () => {
    const { auth, store, central, request, signIn, postToken, accounts } = await serve({ devices: true })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const phone = cookiesOf(await postToken('central', await central.idToken(claims({ sub: 'device-1' })))).join('; ')
    const cookie = await signIn('octo@example.com')
    const { links } = (await (await request('/account/device-links', { cookie })).json()) as Links
    // The device is refused already, as a sign-out that failed after its first step left it.
    await store.query(`insert into refused_account (id, provider_id, account_id, user_id, created_at) select 'refused-1', 'central', 'device-1', user_id, now() from account where provider_id = 'central'`)
    expect((await request('/account/device-links/sign-out', { cookie, body: { id: links[0]!.id } })).status).toBe(200)
    expect(await (await request('/get-session', { cookie: phone })).json()).toBeNull()
    expect(await accounts()).toEqual([])
  })

  it("cannot sign out another person's device", async () => {
    const { auth, central, request, signIn, postToken } = await serve({ devices: true })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    await createUser(auth, { email: 'sanne@example.com', password, role: 'user' })
    await postToken('central', await central.idToken(claims({ sub: 'device-1' })))
    const { links } = (await (await request('/account/device-links', { cookie: await signIn('octo@example.com') })).json()) as Links
    const refused = await request('/account/device-links/sign-out', { cookie: await signIn('sanne@example.com'), body: { id: links[0]!.id } })
    expect(refused.status).toBe(404)
  })
})
