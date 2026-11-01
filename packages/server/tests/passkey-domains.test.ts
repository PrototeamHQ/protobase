import { Kysely } from 'kysely'
import { beforeAll, describe, expect, it } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { softwarePasskey, type SoftwarePasskey } from './support/software-passkey'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

const label = 'https://erp-x1.protobase.net'
const custom = 'https://admin.shop.com'
const secret = 'test-secret-test-secret-test-secret-1234'

let shared: SnapshotDb
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await openSnapshotDb('auth')
  appDb = new Kysely<any>({ dialect: shared.dialect })
})

const cookiesOf = (response: Response) => response.headers.getSetCookie().map((line) => line.split(';')[0]!).join('; ')

const serve = async (options: Partial<CreateAuthOptions> = {}) => {
  const auth = createAuth({ database: { dialect: (await shared.clone()).dialect, type: 'postgres' }, baseURL: label, secret, mailer: false, ...options })
  await createUser(auth, { email: 'root@example.com', password: 'correct horse battery' })
  const { adapter } = await auth.$context
  const [user] = await adapter.findMany<{ id: string }>({ model: 'user' })
  const app = createAdmin({ resources: [], db: appDb, authenticate: betterAuthAuthenticator({ auth }), auth })

  // A passkey of root's as a registration would store it: `rpID` left out gets the passkey domain, `null` is one made
  // before passkeys kept their RP ID.
  const addPasskey = async (key: SoftwarePasskey, rpID?: string | null) => {
    const data = { userId: user!.id, credentialID: key.id, publicKey: key.publicKey, counter: 0, deviceType: 'singleDevice', backedUp: false, transports: 'internal', createdAt: new Date() }
    await adapter.create({ model: 'passkey', data: rpID === undefined ? data : { ...data, rpID } })
    return (await adapter.findOne<{ rpID: string | null }>({ model: 'passkey', where: [{ field: 'credentialID', value: key.id }] }))!.rpID
  }

  // The browser on `at`: asks for options of `rpId` (the passkey domain when left out), then answers with `key` for
  // the RP ID the options name, or for `answerFor` when given. The request's `Origin` header is `header` and the answer
  // names `named`, both `at` when left out; a `null` one names none.
  const signIn = async ({ at, key, rpId, answerFor, header = at, named = at }: { at: string; key: SoftwarePasskey; rpId?: string; answerFor?: string; header?: string; named?: string | null }) => {
    const options = await app.request(`${at}/api/auth/passkey/generate-authenticate-options${rpId ? `?rpId=${rpId}` : ''}`)
    if (options.status !== 200) return options
    const { challenge, rpId: asked } = (await options.json()) as { challenge: string; rpId: string }
    const response = key.answer({ challenge, rpId: answerFor ?? asked, origin: named ?? undefined })
    return app.request(`${at}/api/auth/passkey/verify-authentication`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: header, cookie: cookiesOf(options) },
      body: JSON.stringify({ response }),
    })
  }

  // Root, signed in on `label` with a passkey they have, as adding another needs, adds `key` there: the request's
  // `Origin` header is `header` and the answer names `named`, both `label` when left out; a `null` one names none.
  const register = async ({ key, header = label, named = label }: { key: SoftwarePasskey; header?: string; named?: string | null }) => {
    const existing = softwarePasskey()
    await addPasskey(existing)
    const signedIn = await signIn({ at: label, key: existing })
    expect(signedIn.status).toBe(200)
    const session = cookiesOf(signedIn)
    const options = await app.request(`${label}/api/auth/passkey/generate-register-options`, { headers: { cookie: session } })
    expect(options.status).toBe(200)
    const { challenge, rp } = (await options.json()) as { challenge: string; rp: { id: string } }
    return app.request(`${label}/api/auth/passkey/verify-registration`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: header, cookie: `${session}; ${cookiesOf(options)}` },
      body: JSON.stringify({ response: key.register({ challenge, rpId: rp.id, origin: named ?? undefined }) }),
    })
  }
  const passkeyOf = (key: SoftwarePasskey) => adapter.findOne({ model: 'passkey', where: [{ field: 'credentialID', value: key.id }] })
  const status = async () => (await app.request(`${label}/api/auth/status`)).json()
  return { auth, app, addPasskey, signIn, register, passkeyOf, status }
}

describe('passkeys on an app with several origins', () => {
  it('makes new passkeys for the passkey domain and signs in with them on every origin', async () => {
    const { auth, addPasskey, signIn } = await serve({ origins: [custom], passkeyDomain: 'admin.shop.com' })
    expect(auth.passkeyDomain).toBe('admin.shop.com')
    const key = softwarePasskey()
    expect(await addPasskey(key)).toBe('admin.shop.com')
    for (const at of [custom, label]) {
      const response = await signIn({ at, key })
      expect(response.status).toBe(200)
      expect((await response.json()).user.email).toBe('root@example.com')
    }
  })

  it('checks each passkey against the RP ID it was made for, so changing the passkey domain breaks none', async () => {
    const { addPasskey, signIn } = await serve({ origins: [custom], passkeyDomain: 'admin.shop.com' })
    const before = softwarePasskey()
    const made = softwarePasskey()
    await addPasskey(before, null)
    await addPasskey(made, 'erp-x1.protobase.net')
    for (const key of [before, made]) {
      expect((await signIn({ at: custom, key, rpId: 'erp-x1.protobase.net' })).status).toBe(200)
      // Answered for another RP ID than the passkey's own.
      expect((await signIn({ at: custom, key, rpId: 'erp-x1.protobase.net', answerFor: 'admin.shop.com' })).status).toBe(401)
    }
  })

  it('asks only for the app\'s own hosts', async () => {
    const { signIn } = await serve({ origins: [custom] })
    const response = await signIn({ at: label, key: softwarePasskey(), rpId: 'evil.example.com' })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'UNKNOWN_PASSKEY_DOMAIN' })
  })

  it('names the passkey domains a sign-in can ask for once people have passkeys for more than one', async () => {
    const { addPasskey, status } = await serve({ origins: [custom], passkeyDomain: 'admin.shop.com' })
    expect(await status()).not.toHaveProperty('passkeyDomains')
    await addPasskey(softwarePasskey())
    expect(await status()).not.toHaveProperty('passkeyDomains')
    await addPasskey(softwarePasskey(), null)
    expect((await status()).passkeyDomains).toEqual(['admin.shop.com', 'erp-x1.protobase.net'])
  })

  it('keeps the host of baseURL as passkey domain by default, and refuses one that is not a host of the app', async () => {
    const { auth, addPasskey, signIn } = await serve({ origins: [custom] })
    expect(auth.passkeyDomain).toBe('erp-x1.protobase.net')
    const key = softwarePasskey()
    expect(await addPasskey(key)).toBe('erp-x1.protobase.net')
    expect((await signIn({ at: custom, key })).status).toBe(200)
    await expect(serve({ origins: [custom], passkeyDomain: 'shop.com' })).rejects.toThrow('must be the host of one of the app\'s origins')
  })
})

describe('the origins a passkey\'s answer may name', () => {
  const tunnel = 'https://tunnel.example.net'
  const serveWithTunnel = () => serve({ origins: [custom], trustedOrigins: [tunnel] })
  // Answers that name an origin that is not the app's own, though the first is trusted and sent as the header too.
  const strangers = [
    { what: 'a trusted origin that is not the app\'s', header: tunnel, named: tunnel },
    { what: 'another origin', header: label, named: 'https://example.org' },
    { what: 'no origin', header: label, named: null },
  ]

  it('signs in with an answer that names one of the origins /.well-known/webauthn lists', async () => {
    const { app, addPasskey, signIn } = await serveWithTunnel()
    expect(await (await app.request(`${label}/.well-known/webauthn`)).json()).toEqual({ origins: [label, custom] })
    const key = softwarePasskey()
    await addPasskey(key)
    for (const at of [label, custom]) expect((await signIn({ at, key })).status).toBe(200)
  })

  it.each(strangers)('refuses a sign-in whose answer names $what', async ({ header, named }) => {
    const { addPasskey, signIn } = await serveWithTunnel()
    const key = softwarePasskey()
    await addPasskey(key)
    const response = await signIn({ at: label, key, header, named })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'AUTHENTICATION_FAILED' })
  })

  it('adds a passkey with an answer that names the app\'s origin', async () => {
    const { register, passkeyOf } = await serveWithTunnel()
    const key = softwarePasskey()
    expect((await register({ key })).status).toBe(200)
    expect(await passkeyOf(key)).toBeTruthy()
  })

  // The passkey plugin answers every failed verification of a registration with a 500 (@better-auth/passkey 1.7.7,
  // dist/index.mjs:424-428), so the refusal shows in its code; the case above differs only in the origin.
  it.each(strangers)('adds no passkey with an answer that names $what', async ({ header, named }) => {
    const { register, passkeyOf } = await serveWithTunnel()
    const key = softwarePasskey()
    const response = await register({ key, header, named })
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ code: 'FAILED_TO_VERIFY_REGISTRATION' })
    expect(await passkeyOf(key)).toBeNull()
  })
})
