import { beforeAll, describe, expect, it } from 'vitest'
import { cookiesOf, openVaultDb, serveVault } from './support/vault-app'
import type { SnapshotDb } from '../../../test-support/sql-snapshot'

// A first passkey or second step, on an account with neither, confirms it's them first: a stolen session must not add
// a factor of its own, which would then count as a strong sign-in.

let shared: SnapshotDb
beforeAll(async () => {
  shared = await openVaultDb()
})

const password = 'correct horse battery'

const serve = (options?: { dana?: boolean }) => serveVault(shared, options)

describe('a first passkey on a session older than a day', () => {
  it('is refused until the session confirms it with the password', async () => {
    const { post, signIn, age, addPasskey } = await serve()
    const cookie = await signIn()
    await age()
    const refused = await addPasskey(cookie)
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'STRONG_SIGN_IN_REQUIRED' })
    expect((await post('/account/confirm-password', { password }, cookie)).status).toBe(200)
    expect((await addPasskey(cookie)).status).toBe(200)
  })

  it('is added once the session confirms it with an emailed code', async () => {
    const { post, signIn, sendCode, age, addPasskey } = await serve()
    const cookie = await signIn()
    await age()
    expect(await (await addPasskey(cookie)).json()).toMatchObject({ code: 'STRONG_SIGN_IN_REQUIRED' })
    expect((await post('/account/confirmation-code/verify', { code: await sendCode(cookie) }, cookie)).status).toBe(200)
    expect((await addPasskey(cookie)).status).toBe(200)
  })

  it('is added at once by a session that confirmed it within the window', async () => {
    const { post, signIn, sendCode, age, addPasskey } = await serve()
    const cookie = await signIn()
    await age()
    expect((await post('/account/confirmation-code/verify', { code: await sendCode(cookie) }, cookie)).status).toBe(200)
    expect((await addPasskey(cookie)).status).toBe(200)
  })

  it('refuses a wrong password, which counts toward the password checks', async () => {
    const { post, signIn, age, addPasskey } = await serve()
    const cookie = await signIn()
    await age()
    for (let tries = 0; tries < 5; tries++) {
      const wrong = await post('/account/confirm-password', { password: 'not the password' }, cookie)
      expect(wrong.status).toBe(400)
      expect(await wrong.json()).toMatchObject({ code: 'INVALID_PASSWORD' })
    }
    const capped = await post('/account/confirm-password', { password }, cookie)
    expect(capped.status).toBe(429)
    expect(await capped.json()).toMatchObject({ code: 'TOO_MANY_PASSWORD_CHECKS' })
    expect(await (await addPasskey(cookie)).json()).toMatchObject({ code: 'STRONG_SIGN_IN_REQUIRED' })
  })
})

describe('the password that confirms a first passkey', () => {
  it('does not reveal a strong sign-in field', async () => {
    const { post, signIn, age, reveal } = await serve()
    const cookie = await signIn()
    await age()
    expect((await post('/account/confirm-password', { password }, cookie)).status).toBe(200)
    expect((await reveal(cookie)).status).toBe(403)
  })

  it('is not offered to an account with a passkey', async () => {
    const { post, signIn, addPasskey } = await serve()
    const cookie = await signIn()
    expect((await addPasskey(cookie)).status).toBe(200)
    const refused = await post('/account/confirm-password', { password }, cookie)
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'PASSWORD_CONFIRMATION_NOT_OFFERED' })
  })
})

describe('turning on a second step on a session older than a day', () => {
  it('takes the password of an account that has one, and refuses a wrong one', async () => {
    const { post, signIn, age } = await serve()
    const cookie = await signIn()
    await age()
    const wrong = await post('/two-factor/enable', { password: 'not the password', method: 'otp' }, cookie)
    expect(wrong.status).toBe(400)
    expect(await wrong.json()).toMatchObject({ code: 'INVALID_PASSWORD' })
    expect((await post('/two-factor/enable', { password, method: 'otp' }, cookie)).status).toBe(200)
  })

  it('is refused without a password until the session confirms it with an emailed code', async () => {
    const { post, signInWithCode, sendCode, age } = await serve({ dana: true })
    const cookie = await signInWithCode('dana@example.com')
    await age('dana@example.com')
    const refused = await post('/two-factor/enable', { method: 'otp' }, cookie)
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'STRONG_SIGN_IN_REQUIRED' })
    // A password confirms a first passkey only, and Dana has none.
    expect((await post('/account/confirm-password', { password }, cookie)).status).toBe(403)
    expect((await post('/account/confirmation-code/verify', { code: await sendCode(cookie) }, cookie)).status).toBe(200)
    const turnedOn = await post('/two-factor/enable', { method: 'otp' }, cookie)
    expect(turnedOn.status).toBe(200)
    expect(cookiesOf(turnedOn)).not.toBe('')
  })

  it('is turned on without a password by a session that signed in within a day', async () => {
    const { post, signInWithCode } = await serve({ dana: true })
    const cookie = await signInWithCode('dana@example.com')
    expect((await post('/two-factor/enable', { method: 'otp' }, cookie)).status).toBe(200)
  })
})
