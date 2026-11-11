import { beforeAll, describe, expect, it } from 'vitest'
import { authenticatorCode, cookiesOf, openVaultDb, serveVault } from './support/vault-app'
import type { SnapshotDb } from '../../../test-support/sql-snapshot'

// Account changes that once asked to sign out and sign in again, and now confirm it's them in place.

let shared: SnapshotDb
beforeAll(async () => {
  shared = await openVaultDb()
})

const serve = (options?: { bob?: boolean }) => serveVault(shared, options)

describe('an account change on a session older than a day', () => {
  it('lists the devices without confirming', async () => {
    const { get, signIn, age } = await serve()
    const cookie = await signIn()
    await age()
    expect((await get('/list-sessions', cookie)).status).toBe(200)
  })

  it('confirms another passkey in place with the second step', async () => {
    const { post, signIn, age, addPasskey, turnOnAuthenticatorApp } = await serve()
    const { totpURI, cookie } = await turnOnAuthenticatorApp(await signIn())
    await age()
    const refused = await addPasskey(cookie)
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'STRONG_SIGN_IN_REQUIRED' })
    const confirmed = await post('/two-factor/verify-totp', { code: authenticatorCode(totpURI) }, cookie)
    expect(confirmed.status).toBe(200)
    expect((await addPasskey(cookiesOf(confirmed) || cookie)).status).toBe(200)
  })

  it('confirms another passkey in place with an emailed second step', async () => {
    const { nextMail, post, signIn, age, addPasskey } = await serve()
    const signedIn = await signIn()
    const turnedOn = await post('/two-factor/enable', { password: 'correct horse battery', method: 'otp' }, signedIn)
    expect(turnedOn.status).toBe(200)
    // Turning it on signs this browser in anew.
    const cookie = cookiesOf(turnedOn) || signedIn
    await age()
    expect(await (await addPasskey(cookie)).json()).toMatchObject({ code: 'STRONG_SIGN_IN_REQUIRED' })
    const mailed = nextMail()
    expect((await post('/two-factor/send-otp', {}, cookie)).status).toBe(200)
    const code = (await mailed).subject.slice(0, 6)
    const confirmed = await post('/two-factor/verify-otp', { code }, cookie)
    expect(confirmed.status).toBe(200)
    expect((await addPasskey(cookiesOf(confirmed) || cookie)).status).toBe(200)
  })

  it('deletes the account without a password once confirmed in place with an emailed code', async () => {
    const { adapter, post, signIn, sendCode, age } = await serve({ bob: true })
    // Bob, since root is the last admin, who cannot delete themselves.
    const cookie = await signIn('bob@example.com')
    const id = await age('bob@example.com')
    const refused = await post('/delete-user', {}, cookie)
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'STRONG_SIGN_IN_REQUIRED' })
    expect((await post('/account/confirmation-code/verify', { code: await sendCode(cookie) }, cookie)).status).toBe(200)
    expect((await post('/delete-user', {}, cookie)).status).toBe(200)
    expect(await adapter.findOne({ model: 'user', where: [{ field: 'id', value: id }] })).toBeNull()
  })
})
