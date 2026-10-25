import { createHmac } from 'node:crypto'
import { Kysely } from 'kysely'
import { beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// Better Auth notes the sessions that proved a passkey or a second step, and a field that needs a recent strong
// sign-in is revealed through such a session only.

const label = 'https://vault.example.test'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'

const vaults = resource('vaults')
  .table('vaults')
  .fields({ id: f.integer().readOnly(), name: f.text(), recoveryCode: f.text().strongSignIn() })
  .primaryKey((r) => r.id)

let shared: SnapshotDb
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await openSnapshotDb('auth')
  await shared.exec(`
    create table vaults (id integer generated always as identity primary key, name text not null, recovery_code text not null);
    insert into vaults (name, recovery_code) values ('Main', 'recover-main');
  `)
  appDb = new Kysely<any>({ dialect: shared.dialect })
})

const serve = async () => {
  const auth = createAuth({ database: { dialect: (await shared.clone()).dialect, type: 'postgres' }, baseURL: label, secret })
  await createUser(auth, { email: 'root@example.com', password })
  const app = createAdmin({ resources: [vaults], db: appDb, authenticate: betterAuthAuthenticator({ auth }), auth, options: { audit: { publish: async () => {} } } })
  const post = (path: string, body: object, cookie = '') =>
    app.request(`${label}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: label, ...(cookie && { cookie }) }, body: JSON.stringify(body) })
  const reveal = async (cookie: string) => {
    const { token } = await (await app.request(`${label}/api/auth/token`, { headers: { cookie } })).json()
    return app.request(`${label}/api/v1/vaults/1:reveal`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ field: 'recoveryCode' }) })
  }
  return { post, reveal }
}

// The cookies a browser keeps from a response; a cookie the response clears is left out.
const cookiesOf = (response: Response) =>
  response.headers.getSetCookie().map((line) => line.split(';')[0]!).filter((pair) => !pair.endsWith('=')).join('; ')

const base32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const decodeBase32 = (text: string) => {
  const bits = [...text].map((char) => base32.indexOf(char).toString(2).padStart(5, '0')).join('')
  return Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, index) => parseInt(bits.slice(index * 8, index * 8 + 8), 2)))
}

// What an authenticator app shows for the otpauth:// URI it scanned (RFC 6238: HMAC-SHA1, 30 seconds, 6 digits).
const authenticatorCode = (uri: string) => {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const hmac = createHmac('sha1', decodeBase32(new URL(uri).searchParams.get('secret')!)).update(counter).digest()
  return String((hmac.readUInt32BE(hmac[hmac.length - 1]! & 15) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

describe('a reveal that needs a recent strong sign-in', () => {
  it('is refused after a password alone and after turning the authenticator app on, and answered after the second step', async () => {
    const { post, reveal } = await serve()
    const cookie = cookiesOf(await post('/sign-in/email', { email: 'root@example.com', password }))
    expect((await reveal(cookie)).status).toBe(403)

    const { totpURI } = (await (await post('/two-factor/enable', { password, method: 'totp' }, cookie)).json()) as { totpURI: string }
    const turnedOn = await post('/two-factor/verify-totp', { code: authenticatorCode(totpURI) }, cookie)
    expect(turnedOn.status).toBe(200)
    expect((await reveal(cookiesOf(turnedOn) || cookie)).status).toBe(403)

    const pending = cookiesOf(await post('/sign-in/email', { email: 'root@example.com', password }))
    const verified = await post('/two-factor/verify-totp', { code: authenticatorCode(totpURI) }, pending)
    expect(verified.status).toBe(200)
    const revealed = await reveal(cookiesOf(verified))
    expect(revealed.status).toBe(200)
    expect(await revealed.json()).toEqual({ field: 'recoveryCode', value: 'recover-main' })
  })
})
