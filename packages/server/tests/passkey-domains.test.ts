import type { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { beforeAll, describe, expect, it } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { createAuthStore } from '../../../test-support/auth'
import { softwarePasskey, type SoftwarePasskey } from './support/software-passkey'

const label = 'https://erp-x1.protobase.net'
const custom = 'https://admin.shop.com'
const secret = 'test-secret-test-secret-test-secret-1234'

let shared: PGlite
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await createAuthStore()
  appDb = new Kysely<any>({ dialect: new PGliteDialect(shared) })
})

const cookiesOf = (response: Response) => response.headers.getSetCookie().map((line) => line.split(';')[0]!).join('; ')

const serve = async (options: Partial<CreateAuthOptions> = {}) => {
  const auth = createAuth({ database: { dialect: new PGliteDialect((await shared.clone()) as PGlite), type: 'postgres' }, baseURL: label, secret, mailer: false, ...options })
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
  // the RP ID the options name, or for `answerFor` when given.
  const signIn = async ({ at, key, rpId, answerFor }: { at: string; key: SoftwarePasskey; rpId?: string; answerFor?: string }) => {
    const options = await app.request(`${at}/api/auth/passkey/generate-authenticate-options${rpId ? `?rpId=${rpId}` : ''}`)
    if (options.status !== 200) return options
    const { challenge, rpId: named } = (await options.json()) as { challenge: string; rpId: string }
    const response = key.answer({ challenge, rpId: answerFor ?? named, origin: at })
    return app.request(`${at}/api/auth/passkey/verify-authentication`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: at, cookie: cookiesOf(options) },
      body: JSON.stringify({ response }),
    })
  }
  const status = async () => (await app.request(`${label}/api/auth/status`)).json()
  return { auth, app, addPasskey, signIn, status }
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
