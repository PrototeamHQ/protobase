import { symmetricEncrypt } from 'better-auth/crypto'
import { generateExportedKeyPair } from 'better-auth/plugins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { issueToken } from '../src/better-auth/tokens'
import { createUser } from '../src/better-auth/users'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

const origin = 'http://localhost:5173'
const email = 'root@example.com'
const oldSecret = 'old-secret-old-secret-old-secret-123456'
const newSecret = 'new-secret-new-secret-new-secret-654321'
const day = 24 * 60 * 60_000

afterEach(() => { vi.useRealTimers() })

const authOver = (store: SnapshotDb, options: Partial<CreateAuthOptions> = {}) =>
  createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret: oldSecret, mailer: false, ...options })

// A store with its first admin, and the auth over it.
const withUser = async (options: Partial<CreateAuthOptions> = {}) => {
  const store = await openSnapshotDb('auth')
  const auth = authOver(store, options)
  await createUser(auth, { email, password: 'correct horse battery' })
  return { store, auth }
}

type Auth = ReturnType<typeof createAuth>

const headerOf = (token: string) => JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString()) as { alg: string; kid: string }

const dayToken = async (auth: Auth) => (await issueToken(auth, { email, ttlSeconds: 24 * 60 * 60 })).token

// Whether `auth`'s API takes `token`, reading the key set afresh.
const accepts = async (auth: Auth, token: string) => {
  const authenticate = betterAuthAuthenticator({ auth, tenant: 1, cache: { refreshMs: 0 } })
  return Promise.resolve(authenticate(new Request(`${origin}/api/v1/companies`, { headers: { authorization: `Bearer ${token}` } }))).then(() => true, () => false)
}

const publishedKids = async (auth: Auth) => (await auth.api.getJwks()).keys.map((key) => key.kid)

const at = (start: number, offset: number) => vi.useFakeTimers({ toFake: ['Date'], now: start + offset })

describe('signing key rotation', () => {
  it('signs with a key for 30 days, then with a new one, and verifies the old one for 7 days more', async () => {
    const { auth } = await withUser()
    const start = Date.now()
    const first = headerOf(await dayToken(auth))
    expect(first.alg).toBe('EdDSA')

    at(start, 30 * day - 2 * 60_000)
    const late = await dayToken(auth)
    expect(headerOf(late).kid).toBe(first.kid)

    at(start, 30 * day + 60 * 60_000)
    const next = headerOf(await dayToken(auth))
    expect(next).toMatchObject({ alg: 'EdDSA' })
    expect(next.kid).not.toBe(first.kid)
    expect(await accepts(auth, late)).toBe(true)
    expect(await publishedKids(auth)).toEqual(expect.arrayContaining([first.kid, next.kid]))

    at(start, 37 * day + 60 * 60_000)
    expect(await publishedKids(auth)).not.toContain(first.kid)
    expect(await accepts(auth, late)).toBe(false)
  })

  // The tests' times stay well before the real clock, which the recordings take for Postgres's own times.
  it('takes the days from signingKeyDays and signingKeyGraceDays, and deletes a key once its grace period is over', async () => {
    const { store, auth } = await withUser({ signingKeyDays: 2, signingKeyGraceDays: 1 })
    const start = Date.now()
    const first = headerOf(await dayToken(auth))
    at(start, 2 * day + 60_000)
    const second = headerOf(await dayToken(auth))
    expect(second.kid).not.toBe(first.kid)
    expect(await publishedKids(auth)).toContain(first.kid)
    at(start, 3 * day + 2 * 60_000)
    expect(await publishedKids(auth)).not.toContain(first.kid)

    // The next rotation deletes the key whose grace period is over; the one it replaces stays for its own.
    at(start, 4 * day + 2 * 60_000)
    const third = headerOf(await dayToken(auth))
    const { rows } = await store.query<{ id: string }>("select id from jwks where alg = 'EdDSA' order by created_at")
    expect(rows.map(({ id }) => id)).toEqual([second.kid, third.kid])
  })

  it("keeps the app's tokens EdDSA once their key expired while the ES256 one of the GoTrue tokens lives", async () => {
    const { auth } = await withUser()
    const start = Date.now()
    const first = headerOf(await dayToken(auth))
    const context = await auth.$context
    const user = (await context.internalAdapter.findUserByEmail(email))!.user
    at(start, 10 * day)
    const session = await context.internalAdapter.createSession(user.id)
    const goTrue = await auth.api.goTrueSession({ body: { sessionToken: session.token } })
    expect(headerOf(goTrue.access_token).alg).toBe('ES256')

    at(start, 31 * day)
    const next = headerOf(await dayToken(auth))
    expect(next.alg).toBe('EdDSA')
    expect(next.kid).not.toBe(first.kid)
  })
})

describe('a key made before keys rotated', () => {
  // A key as the app stored it before: its private half encrypted with the bare secret, and no expiry.
  const storeOldKey = async (store: SnapshotDb, createdAt: Date) => {
    const { publicWebKey, privateWebKey } = await generateExportedKeyPair()
    const privateKey = JSON.stringify(await symmetricEncrypt({ key: oldSecret, data: JSON.stringify(privateWebKey) }))
    await store.query('insert into jwks (id, public_key, private_key, created_at, alg, crv) values ($1, $2, $3, $4, $5, $6)', ['old-key', JSON.stringify(publicWebKey), privateKey, createdAt, 'EdDSA', 'Ed25519'])
  }

  it('keeps signing, encrypted with the secret before the current one, and expires 30 days after it was made', async () => {
    const { store } = await withUser()
    await storeOldKey(store, new Date(Date.now() - 20 * day))
    const auth = authOver(store, { secret: newSecret, previousSecrets: [oldSecret] })
    expect(headerOf(await dayToken(auth)).kid).toBe('old-key')
    const { rows } = await store.query<{ expires_at: Date }>("select expires_at from jwks where id = 'old-key'")
    expect(rows[0]!.expires_at.getTime()).toBe(Date.now() + 10 * day)
  })

  it('is replaced at once when it is older than that, and deleted once its grace period is over too', async () => {
    const { store, auth } = await withUser()
    await storeOldKey(store, new Date(Date.now() - 40 * day))
    const next = headerOf(await dayToken(auth))
    expect(next.kid).not.toBe('old-key')
    expect(await publishedKids(auth)).not.toContain('old-key')
    expect((await store.query("select id from jwks where id = 'old-key'")).rows).toEqual([])
  })
})

describe('changing the secret', () => {
  it('keeps the signing key with the old secret in previousSecrets, and its tokens verify', async () => {
    const { store, auth: before } = await withUser()
    const token = await dayToken(before)
    const after = authOver(store, { secret: newSecret, previousSecrets: [oldSecret] })
    expect(headerOf(await dayToken(after)).kid).toBe(headerOf(token).kid)
    expect(await accepts(after, token)).toBe(true)
  })

  it('cannot sign without it, as the key no longer decrypts', async () => {
    const { store, auth: before } = await withUser()
    await dayToken(before)
    const after = authOver(store, { secret: newSecret })
    await expect(dayToken(after)).rejects.toThrow('Failed to decrypt private key')
  })

  it('signs with a new key once the old one rotated out, and the old secret can go', async () => {
    const { store, auth: before } = await withUser()
    const start = Date.now()
    const first = headerOf(await dayToken(before))
    at(start, 31 * day)
    const after = authOver(store, { secret: newSecret })
    expect(headerOf(await dayToken(after)).kid).not.toBe(first.kid)
  })
})
