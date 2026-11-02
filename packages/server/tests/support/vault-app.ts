import { createHmac } from 'node:crypto'
import { Kysely } from 'kysely'
import { expect, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { betterAuthAuthenticator } from '../../src/better-auth/authenticator'
import { createAuth } from '../../src/better-auth/create-auth'
import { createUser } from '../../src/better-auth/users'
import { createAdmin } from '../../src/create-admin'
import type { MailMessage } from '../../src/mail/mail-message'
import { softwarePasskey } from './software-passkey'
import { openSnapshotDb, type SnapshotDb } from '../../../../test-support/sql-snapshot'

// An app whose people confirm it's them in place: with a code emailed on request, for an account without a passkey or
// a second step, and for the account changes that once asked to sign out and sign in again.

const label = 'https://vault.example.test'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'
const day = 24 * 60 * 60 * 1000

const vaults = resource('vaults')
  .table('vaults')
  .fields({ id: f.integer().readOnly(), name: f.text(), recoveryCode: f.text().strongSignIn() })
  .primaryKey((r) => r.id)

/** The store each test clones, with a vault whose recovery code needs a recent strong sign-in. */
export const openVaultDb = async () => {
  const shared = await openSnapshotDb('auth')
  await shared.exec(`
    create table vaults (id integer generated always as identity primary key, name text not null, recovery_code text not null);
    insert into vaults (name, recovery_code) values ('Main', 'recover-main');
  `)
  return shared
}

/** The cookies a browser keeps from a response; a cookie the response clears is left out. */
export const cookiesOf = (response: Response) =>
  response.headers.getSetCookie().map((line) => line.split(';')[0]!).filter((pair) => !pair.endsWith('=')).join('; ')

const base32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const decodeBase32 = (text: string) => {
  const bits = [...text].map((char) => base32.indexOf(char).toString(2).padStart(5, '0')).join('')
  return Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, index) => parseInt(bits.slice(index * 8, index * 8 + 8), 2)))
}

/** What an authenticator app shows for the otpauth:// URI it scanned (RFC 6238: HMAC-SHA1, 30 seconds, 6 digits). */
export const authenticatorCode = (uri: string) => {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const hmac = createHmac('sha1', decodeBase32(new URL(uri).searchParams.get('secret')!)).update(counter).digest()
  return String((hmac.readUInt32BE(hmac[hmac.length - 1]! & 15) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

// Better Auth limits requests per client address, in one map for the whole test file; every request comes from a new one.
let client = 0

/**
 * Serves a clone of `shared` with root, the first user and so the admin, Bob when `bob` asks for him, and Dana, who has
 * no password, when `dana` asks for her.
 */
export const serveVault = async (shared: SnapshotDb, { bob = false, dana = false } = {}) => {
  const sent: MailMessage[] = []
  const mail = { failing: false }
  const auth = createAuth({
    database: { dialect: (await shared.clone()).dialect, type: 'postgres' },
    baseURL: label,
    secret,
    mailer: {
      send: async (message) => {
        if (mail.failing) throw new Error('The mail server refused the message')
        sent.push(message)
      },
    },
  })
  await createUser(auth, { email: 'root@example.com', password })
  if (bob) await createUser(auth, { email: 'bob@example.com', password })
  if (dana) await createUser(auth, { email: 'dana@example.com' })
  const { adapter } = await auth.$context
  const app = createAdmin({ resources: [vaults], db: new Kysely<any>({ dialect: shared.dialect }), authenticate: betterAuthAuthenticator({ auth }), auth, options: { audit: { publish: async () => {} } } })

  const headers = (cookie: string) => ({ 'content-type': 'application/json', origin: label, cookie, 'x-forwarded-for': `198.51.100.${++client}` })
  const post = (path: string, body: object, cookie = '') => app.request(`${label}/api/auth${path}`, { method: 'POST', headers: headers(cookie), body: JSON.stringify(body) })
  const get = (path: string, cookie: string) => app.request(`${label}/api/auth${path}`, { headers: headers(cookie) })
  const signIn = async (email = 'root@example.com') => {
    const response = await post('/sign-in/email', { email, password })
    expect(response.status).toBe(200)
    return cookiesOf(response)
  }
  // Signs in with an emailed sign-in code, as someone without a password does.
  const signInWithCode = async (email: string) => {
    expect((await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })).status).toBe(200)
    // Better Auth sends it after the answer.
    const message = await vi.waitFor(() => {
      const found = sent.find((mailed) => mailed.to === email && / sign-in code$/.test(mailed.subject))
      if (!found) throw new Error('No sign-in code mailed yet')
      return found
    })
    const response = await post('/sign-in/email-otp', { email, otp: message.subject.slice(0, 6) })
    expect(response.status).toBe(200)
    return cookiesOf(response)
  }
  const reveal = async (cookie: string) => {
    const { token } = await (await get('/token', cookie)).json()
    return app.request(`${label}/api/v1/vaults/1:reveal`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ field: 'recoveryCode' }) })
  }
  // The code of the last confirmation email, which its subject begins with.
  const mailedCode = () => {
    const message = sent.at(-1)!
    expect(message.subject).toMatch(/^\d{6} confirms it's you in /)
    return message.subject.slice(0, 6)
  }
  const sendCode = async (cookie: string) => {
    const response = await post('/account/confirmation-code/send', {}, cookie)
    expect(response.status).toBe(200)
    return mailedCode()
  }
  // Every session of the user signed in two days ago, older than Better Auth's fresh age.
  const age = async (email = 'root@example.com') => {
    const user = await adapter.findOne<{ id: string }>({ model: 'user', where: [{ field: 'email', value: email }] })
    await adapter.updateMany({ model: 'session', where: [{ field: 'userId', value: user!.id }], update: { createdAt: new Date(Date.now() - 2 * day) } })
    return user!.id
  }
  // Adds a passkey as the account page does: options first, then the browser's answer.
  const addPasskey = async (cookie: string) => {
    const options = await get('/passkey/generate-register-options', cookie)
    if (options.status !== 200) return options
    const { challenge, rp } = (await options.json()) as { challenge: string; rp: { id: string } }
    return post('/passkey/verify-registration', { response: softwarePasskey().register({ challenge, rpId: rp.id, origin: label }) }, `${cookie}; ${cookiesOf(options)}`)
  }
  const turnOnAuthenticatorApp = async (cookie: string) => {
    const { totpURI } = (await (await post('/two-factor/enable', { password, method: 'totp' }, cookie)).json()) as { totpURI: string }
    const turnedOn = await post('/two-factor/verify-totp', { code: authenticatorCode(totpURI) }, cookie)
    expect(turnedOn.status).toBe(200)
    // Turning it on signs this browser in anew.
    return { totpURI, cookie: cookiesOf(turnedOn) || cookie }
  }
  return { adapter, sent, mail, post, get, signIn, signInWithCode, reveal, sendCode, mailedCode, age, addPasskey, turnOnAuthenticatorApp }
}
