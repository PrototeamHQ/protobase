import { beforeAll, describe, expect, it } from 'vitest'
import { cookiesOf, openVaultDb, serveVault } from './support/vault-app'
import type { SnapshotDb } from '../../../test-support/sql-snapshot'

// A code emailed on request confirms it's them inside a signed-in session, for an account without a passkey or a second step.

let shared: SnapshotDb
beforeAll(async () => {
  shared = await openVaultDb()
})

const serve = (options?: { bob?: boolean }) => serveVault(shared, options)

describe('an emailed confirmation code', () => {
  it('confirms a reveal for an account without a passkey or a second step', async () => {
    const { post, signIn, reveal, sendCode } = await serve()
    const cookie = await signIn()
    expect((await reveal(cookie)).status).toBe(403)
    const code = await sendCode(cookie)
    expect((await post('/account/confirmation-code/verify', { code }, cookie)).status).toBe(200)
    const revealed = await reveal(cookie)
    expect(revealed.status).toBe(200)
    expect(await revealed.json()).toEqual({ field: 'recoveryCode', value: 'recover-main' })
  })

  it('is never a sign-in code', async () => {
    const { post, signIn, sendCode } = await serve()
    const code = await sendCode(await signIn())
    const signedIn = await post('/sign-in/email-otp', { email: 'root@example.com', otp: code })
    expect(signedIn.status).toBe(400)
    expect(cookiesOf(signedIn)).toBe('')
  })

  it('works only in the session of the user that asked for it', async () => {
    const { post, signIn, sendCode } = await serve({ bob: true })
    const asked = await signIn()
    const code = await sendCode(asked)
    for (const other of [await signIn(), await signIn('bob@example.com')]) {
      const refused = await post('/account/confirmation-code/verify', { code }, other)
      expect(refused.status).toBe(400)
      expect(await refused.json()).toMatchObject({ code: 'OTP_EXPIRED' })
    }
    expect((await post('/account/confirmation-code/verify', { code }, asked)).status).toBe(200)
  })

  it('stops working after three wrong codes', async () => {
    const { post, signIn, sendCode } = await serve()
    const cookie = await signIn()
    const code = await sendCode(cookie)
    const wrong = code === '000000' ? '111111' : '000000'
    for (const expected of ['INVALID_CODE', 'INVALID_CODE', 'TOO_MANY_ATTEMPTS']) {
      expect(await (await post('/account/confirmation-code/verify', { code: wrong }, cookie)).json()).toMatchObject({ code: expected })
    }
    expect((await post('/account/confirmation-code/verify', { code }, cookie)).status).toBe(400)
  })

  it('is refused when the email cannot be sent, and ends the code before', async () => {
    const { mail, post, signIn, sendCode } = await serve()
    const cookie = await signIn()
    const earlier = await sendCode(cookie)
    mail.failing = true
    expect((await post('/account/confirmation-code/send', {}, cookie)).status).toBe(500)
    expect((await post('/account/confirmation-code/verify', { code: earlier }, cookie)).status).toBe(400)
  })

  it('is not offered to an account with a passkey or a second step', async () => {
    const { sent, post, signIn, addPasskey, turnOnAuthenticatorApp } = await serve({ bob: true })
    const withPasskey = await signIn()
    expect((await addPasskey(withPasskey)).status).toBe(200)
    const { cookie: withApp } = await turnOnAuthenticatorApp(await signIn('bob@example.com'))
    for (const cookie of [withPasskey, withApp]) {
      const refused = await post('/account/confirmation-code/send', {}, cookie)
      expect(refused.status).toBe(403)
      expect(await refused.json()).toMatchObject({ code: 'CONFIRMATION_CODE_NOT_OFFERED' })
    }
    expect(sent).toEqual([])
  })
})
