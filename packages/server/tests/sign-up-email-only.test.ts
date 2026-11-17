import { decodeJwt } from 'jose'
import { describe, expect, it, vi } from 'vitest'
import { defaultSignInPolicy } from '../src/better-auth/sign-in-policy'
import { password, signUpServer } from './support/sign-up-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const { serve } = signUpServer()

const signUp = { role: 'member' }

describe('open sign-up that asks for the address only', () => {
  const emailOnly = { role: 'member', fields: ['email' as const] }

  // Code, account and token: the whole flow, longer than one request on a busy runner.
  it('makes the account of a new address with the emailed sign-in code, on the spot, verified and with the sign-up role', async () => {
    const { auth, status, askSignInCode, signInWithCode, codeFor, cookiesOf, tokenOf, userOf } = await serve({ signUp: emailOnly })
    expect(auth.signUpFields).toEqual(['email'])
    expect(await status()).toMatchObject({ signUp: true, signUpFields: ['email'] })
    const asked = await askSignInCode('New@Example.com')
    expect(await asked.json()).toEqual({ success: true })
    expect(await userOf('new@example.com')).toBeUndefined()
    const signedIn = await signInWithCode('New@Example.com', codeFor('new@example.com'))
    expect(signedIn.status).toBe(200)
    const user = await userOf('new@example.com')
    expect(user).toMatchObject({ role: 'member', name: '', emailVerified: true })
    expect(decodeJwt((await tokenOf(cookiesOf(signedIn))).token!)).toMatchObject({ email: 'new@example.com', role: 'member' })
  }, 20_000)

  it('answers and mails a new address as it does one with an account, and signs that one in', async () => {
    const { sent, askSignInCode, signInWithCode, codeFor, userOf } = await serve({ signUp: emailOnly })
    const known = await askSignInCode('sanne@example.com')
    const unknown = await askSignInCode('new@example.com')
    expect([known.status, await known.json()]).toEqual([unknown.status, await unknown.json()])
    const [toKnown, toUnknown] = [sent.findLast((mail) => mail.to === 'sanne@example.com')!, sent.findLast((mail) => mail.to === 'new@example.com')!]
    expect(toUnknown.subject.replace(codeFor('new@example.com'), '<code>')).toBe(toKnown.subject.replace(codeFor('sanne@example.com'), '<code>'))
    expect(toUnknown.text.replaceAll(codeFor('new@example.com'), '<code>')).toBe(toKnown.text.replaceAll(codeFor('sanne@example.com'), '<code>'))
    expect((await signInWithCode('sanne@example.com', codeFor('sanne@example.com'))).status).toBe(200)
    expect(await userOf('sanne@example.com')).toMatchObject({ role: 'member', name: 'sanne' })
  })

  it('answers a wrong code for a new address as for one with an account, and makes nothing', async () => {
    const { askSignInCode, signInWithCode, codeFor, userOf } = await serve({ signUp: emailOnly })
    await askSignInCode('sanne@example.com')
    await askSignInCode('new@example.com')
    const wrong = (code: string) => (code === '000000' ? '111111' : '000000')
    const known = await signInWithCode('sanne@example.com', wrong(codeFor('sanne@example.com')))
    const unknown = await signInWithCode('new@example.com', wrong(codeFor('new@example.com')))
    expect([unknown.status, await unknown.json()]).toEqual([known.status, await known.json()])
    expect(await userOf('new@example.com')).toBeUndefined()
  })

  it('makes the account of an invited address through the invitation: its roles, and the invitation used up', async () => {
    const { invite, invitations, askSignInCode, signInWithCode, codeFor, userOf } = await serve({ signUp: emailOnly })
    await invite('nia@example.com', ['editor'])
    await askSignInCode('nia@example.com')
    expect((await signInWithCode('nia@example.com', codeFor('nia@example.com'))).status).toBe(200)
    expect(await userOf('nia@example.com')).toMatchObject({ role: 'editor', emailVerified: true })
    expect(await invitations()).toEqual([])
  }, 20_000)

  it('makes a plain account with the sign-up role once the invitation was revoked or expired', async () => {
    const { request, invite, rootCookie, askSignInCode, signInWithCode, codeFor, userOf } = await serve({ signUp: emailOnly })
    const id = await invite('nia@example.com', ['editor'])
    expect((await request('/users/invitations/cancel', { cookie: await rootCookie(), body: { id } })).status).toBe(200)
    await askSignInCode('nia@example.com')
    expect((await signInWithCode('nia@example.com', codeFor('nia@example.com'))).status).toBe(200)
    expect(await userOf('nia@example.com')).toMatchObject({ role: 'member' })

    await invite('kim@example.com', ['editor'])
    vi.useFakeTimers({ now: Date.now() + 8 * 24 * 60 * 60 * 1000, toFake: ['Date'] })
    try {
      await askSignInCode('kim@example.com')
      expect((await signInWithCode('kim@example.com', codeFor('kim@example.com'))).status).toBe(200)
      expect(await userOf('kim@example.com')).toMatchObject({ role: 'member' })
    } finally {
      vi.useRealTimers()
    }
  }, 30_000)

  it('mails an address at another domain the no-account email, and makes it no account', async () => {
    const { sent, askSignInCode, signInWithCode, userOf } = await serve({ signUp: { ...emailOnly, domains: ['example.com'] } })
    expect(await (await askSignInCode('new@elsewhere.test')).json()).toEqual({ success: true })
    expect(sent.at(-1)).toMatchObject({ to: 'new@elsewhere.test', subject: 'No Protobase account uses this address' })
    expect(sent.at(-1)!.text).not.toMatch(/\d{6}/)
    expect((await signInWithCode('new@elsewhere.test', '123456')).status).toBe(400)
    expect(await userOf('new@elsewhere.test')).toBeUndefined()
  })

  it('makes no account while the emailed sign-in code is off in the policy', async () => {
    const { request, rootCookie, signInWithCode, userOf } = await serve({ signUp: emailOnly })
    expect((await request('/policy/sign-in', { cookie: await rootCookie(), body: { ...defaultSignInPolicy, emailCode: 'forbidden' } })).status).toBe(200)
    expect((await request('/email-otp/send-verification-otp', { body: { email: 'new@example.com', type: 'sign-in' } })).status).toBe(403)
    expect((await signInWithCode('new@example.com', '123456')).status).toBe(403)
    expect(await userOf('new@example.com')).toBeUndefined()
  })

  it('makes the account from the sign-up page without a name too', async () => {
    const { request, ticketFor, userOf } = await serve({ signUp: emailOnly })
    const created = await request('/sign-up/create', { body: { ticket: await ticketFor('new@example.com') } })
    expect(created.status).toBe(200)
    expect(await userOf('new@example.com')).toMatchObject({ role: 'member', name: '' })
  })

  it('keeps the name step and the no-account email by default', async () => {
    const { sent, request, ticketFor, askSignInCode, signInWithCode, userOf } = await serve({ signUp })
    expect(await (await request('/sign-up/create', { body: { ticket: await ticketFor('new@example.com') } })).json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    await askSignInCode('other@example.com')
    expect(sent.at(-1)).toMatchObject({ to: 'other@example.com', subject: 'No Protobase account uses this address' })
    expect((await signInWithCode('other@example.com', '123456')).status).toBe(400)
    expect(await userOf('other@example.com')).toBeUndefined()
  })
})
