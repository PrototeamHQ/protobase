import { beforeAll, describe, expect, it } from 'vitest'
import { authenticatorCode, cookiesOf, openVaultDb, serveVault } from './support/vault-app'
import type { SnapshotDb } from '../../../test-support/sql-snapshot'

// Better Auth guards the second step's endpoints with the account's password alone; an account without one confirms
// it's them in place first, so a stolen session cannot read the authenticator secret or new backup codes.

let shared: SnapshotDb
beforeAll(async () => {
  shared = await openVaultDb()
})

const password = 'correct horse battery'

const serve = () => serveVault(shared, { dana: true })

describe('the second step of an account without a password, on a session older than a day', () => {
  it('is refused until the session confirms it with the second step', async () => {
    const { post, signInWithCode, age } = await serve()
    const signedIn = await signInWithCode('dana@example.com')
    const { totpURI } = (await (await post('/two-factor/enable', { method: 'totp' }, signedIn)).json()) as { totpURI: string }
    const turnedOn = await post('/two-factor/verify-totp', { code: authenticatorCode(totpURI) }, signedIn)
    expect(turnedOn.status).toBe(200)
    const cookie = cookiesOf(turnedOn) || signedIn
    await age('dana@example.com')
    for (const path of ['/two-factor/get-totp-uri', '/two-factor/generate-backup-codes', '/two-factor/enable']) {
      const refused = await post(path, { method: 'totp' }, cookie)
      expect(refused.status).toBe(403)
      expect(await refused.json()).toMatchObject({ code: 'STRONG_SIGN_IN_REQUIRED' })
    }
    const confirmed = await post('/two-factor/verify-totp', { code: authenticatorCode(totpURI) }, cookie)
    expect(confirmed.status).toBe(200)
    const after = cookiesOf(confirmed) || cookie
    expect(await (await post('/two-factor/get-totp-uri', {}, after)).json()).toMatchObject({ totpURI })
    expect(await (await post('/two-factor/generate-backup-codes', {}, after)).json()).toMatchObject({ status: true })
  })

  it('is not turned on beside a passkey without confirming', async () => {
    const { post, signInWithCode, age, addPasskey } = await serve()
    const cookie = await signInWithCode('dana@example.com')
    expect((await addPasskey(cookie)).status).toBe(200)
    await age('dana@example.com')
    const refused = await post('/two-factor/enable', { method: 'otp' }, cookie)
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'STRONG_SIGN_IN_REQUIRED' })
  })
})

describe('the second step of an account with a password, on a session older than a day', () => {
  it('takes the password instead', async () => {
    const { post, signIn, age, turnOnAuthenticatorApp } = await serve()
    const { totpURI, cookie } = await turnOnAuthenticatorApp(await signIn())
    await age()
    const missing = await post('/two-factor/get-totp-uri', {}, cookie)
    expect(missing.status).toBe(400)
    expect(await missing.json()).toMatchObject({ code: 'INVALID_PASSWORD' })
    expect(await (await post('/two-factor/get-totp-uri', { password }, cookie)).json()).toMatchObject({ totpURI })
    expect(await (await post('/two-factor/generate-backup-codes', { password }, cookie)).json()).toMatchObject({ status: true })
  })
})
