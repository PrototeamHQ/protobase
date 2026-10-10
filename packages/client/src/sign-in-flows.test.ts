import { describe, expect, it } from 'vitest'
import { createAuthSession } from './auth'

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...init.headers } })
const user = { id: 'u1', email: 'sanne@example.com', name: 'Sanne' }

// A session against a fake server that answers by path and records each request.
const serve = (answers: Record<string, () => Response>) => {
  const requests: Array<{ path: string; body?: unknown }> = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname.replace('/api/auth', '')
    const text = await request.text()
    requests.push({ path, ...(text && { body: JSON.parse(text) }) })
    const answer = answers[path]
    return answer ? answer() : json({ message: 'Not found' }, { status: 404 })
  }) as typeof globalThis.fetch
  return { requests, session: createAuthSession({ origin: 'http://localhost', fetch }) }
}

const paths = (requests: Array<{ path: string }>) => requests.map((request) => request.path)

describe('signing in', () => {
  it('signs in with a password and fetches the token', async () => {
    const { requests, session } = serve({ '/sign-in/email': () => json({ user, token: 's' }), '/token': () => json({ message: 'none' }, { status: 401 }) })
    expect(await session.signIn('sanne@example.com', 'correct horse battery')).toEqual({ kind: 'signed-in', user })
    expect(paths(requests)).toEqual(['/sign-in/email', '/token'])
  })

  it('answers the second step when the account has two-factor authentication, without a token yet', async () => {
    const { requests, session } = serve({ '/sign-in/email': () => json({ twoFactorRedirect: true, twoFactorMethods: ['totp', 'otp'] }) })
    expect(await session.signIn('sanne@example.com', 'correct horse battery')).toEqual({ kind: 'two-factor', methods: ['totp', 'otp'] })
    expect(paths(requests)).toEqual(['/sign-in/email'])
  })

  it('asks for a sign-in code and signs in with it', async () => {
    const { requests, session } = serve({ '/email-otp/send-verification-otp': () => json({ success: true }), '/sign-in/email-otp': () => json({ twoFactorRedirect: true, twoFactorMethods: ['totp'] }) })
    await session.sendSignInCode('sanne@example.com')
    expect(await session.signInWithCode('sanne@example.com', '123456')).toEqual({ kind: 'two-factor', methods: ['totp'] })
    expect(requests).toEqual([
      { path: '/email-otp/send-verification-otp', body: { email: 'sanne@example.com', type: 'sign-in' } },
      { path: '/sign-in/email-otp', body: { email: 'sanne@example.com', otp: '123456' } },
    ])
  })

  it('finishes the second step with an authenticator code, an emailed code or a backup code', async () => {
    const signedIn = () => json({ token: 's', user })
    const { requests, session } = serve({ '/two-factor/verify-totp': signedIn, '/two-factor/verify-otp': signedIn, '/two-factor/verify-backup-code': signedIn, '/two-factor/send-otp': () => json({ status: true }), '/token': () => json({ token: undefined }) })
    expect(await session.verifyTwoFactor({ method: 'totp', code: '123456', trustDevice: true })).toEqual(user)
    await session.sendTwoFactorCode()
    await session.verifyTwoFactor({ method: 'otp', code: '654321' })
    await session.verifyTwoFactor({ method: 'backup', code: 'abcde-fghij' })
    expect(requests.filter((request) => request.path !== '/token')).toEqual([
      { path: '/two-factor/verify-totp', body: { code: '123456', trustDevice: true } },
      { path: '/two-factor/send-otp', body: {} },
      { path: '/two-factor/verify-otp', body: { code: '654321', trustDevice: false } },
      { path: '/two-factor/verify-backup-code', body: { code: 'abcde-fghij', trustDevice: false } },
    ])
  })

  it('reports a wrong code and a refused method as AuthError', async () => {
    const { session } = serve({
      '/two-factor/verify-totp': () => json({ message: 'Invalid code', code: 'INVALID_CODE' }, { status: 401 }),
      '/sign-in/email': () => json({ message: 'Signing in with a password is turned off.', code: 'SIGN_IN_METHOD_FORBIDDEN' }, { status: 403 }),
    })
    await expect(session.verifyTwoFactor({ method: 'totp', code: '000000' })).rejects.toMatchObject({ name: 'AuthError', status: 401, code: 'INVALID_CODE' })
    await expect(session.signIn('sanne@example.com', 'x')).rejects.toMatchObject({ status: 403, code: 'SIGN_IN_METHOD_FORBIDDEN', message: 'Signing in with a password is turned off.' })
  })
})

describe('the account and the sign-in policy', () => {
  it('reads what the account has and turns on an authenticator app', async () => {
    const methods = { policy: { password: 'allowed', emailCode: 'allowed', passkey: 'allowed', twoFactor: 'required' }, mail: true, account: { password: true, passkeys: 0, twoFactor: false, authenticatorApp: false }, missing: ['twoFactor'] }
    const { requests, session } = serve({
      '/account/sign-in-methods': () => json(methods),
      '/two-factor/enable': () => json({ method: 'totp', totpURI: 'otpauth://totp/Protobase:sanne%40example.com?secret=ABC', backupCodes: ['a-1', 'b-2'] }),
      '/two-factor/verify-totp': () => json({ token: 's', user }),
    })
    expect(await session.account.signInMethods()).toEqual(methods)
    expect(await session.account.startAuthenticatorApp('correct horse battery')).toEqual({ totpURI: 'otpauth://totp/Protobase:sanne%40example.com?secret=ABC', backupCodes: ['a-1', 'b-2'] })
    await session.account.confirmAuthenticatorApp('123456')
    expect(requests.slice(1)).toEqual([
      { path: '/two-factor/enable', body: { method: 'totp', password: 'correct horse battery' } },
      { path: '/two-factor/verify-totp', body: { code: '123456' } },
    ])
  })

  it('lists, renames and removes passkeys', async () => {
    const { requests, session } = serve({
      '/passkey/list-user-passkeys': () => json([{ id: 'p1', name: 'MacBook', backedUp: true, createdAt: '2026-10-01T09:00:00.000Z', publicKey: 'x', credentialID: 'c' }, { id: 'p2', name: null, backedUp: false, createdAt: null }]),
      '/passkey/update-passkey': () => json({ passkey: { id: 'p1' } }),
      '/passkey/delete-passkey': () => json({ message: 'Passkeys are required for every account, so the last one cannot be removed.', code: 'PASSKEY_REQUIRED' }, { status: 403 }),
    })
    expect(await session.account.passkeys()).toEqual([{ id: 'p1', name: 'MacBook', backedUp: true, createdAt: '2026-10-01T09:00:00.000Z' }, { id: 'p2', backedUp: false }])
    await session.account.renamePasskey('p1', 'Work laptop')
    await expect(session.account.removePasskey('p1')).rejects.toMatchObject({ code: 'PASSKEY_REQUIRED' })
    expect(requests.slice(1)).toEqual([
      { path: '/passkey/update-passkey', body: { id: 'p1', name: 'Work laptop' } },
      { path: '/passkey/delete-passkey', body: { id: 'p1' } },
    ])
  })

  it('reads and saves the sign-in policy, and reports why one is refused', async () => {
    const policy = { password: 'forbidden', emailCode: 'forbidden', passkey: 'required', twoFactor: 'allowed', staffAccess: 'notify' } as const
    const { requests, session } = serve({
      '/policy/sign-in': () => json({ message: 'Keep password or emailed-code sign-in on: people without a passkey need one of them to sign in.', code: 'SIGN_IN_POLICY_REFUSED' }, { status: 400 }),
    })
    const refused = await session.signInPolicy.save(policy).catch((error: unknown) => error)
    expect(refused).toMatchObject({ name: 'AuthError', status: 400, code: 'SIGN_IN_POLICY_REFUSED', message: expect.stringContaining('Keep password or emailed-code sign-in on') })
    expect(requests).toEqual([{ path: '/policy/sign-in', body: policy }])
  })
})

describe('staff signing in as someone', () => {
  const signIn = { id: 's1', user: 'sanne@example.com', staff: 'alex@operator.example', reason: 'Ticket 4211: totals', startedAt: '2026-10-10T12:00:00.000Z', expiresAt: '2026-10-10T12:30:00.000Z' }

  it('starts at the operator provider with the person, the reason and the page to come back to', async () => {
    const { requests, session } = serve({ '/staff/sign-in': () => json({ url: 'https://id.operator.example/authorize?state=x' }) })
    expect(await session.staff.start({ email: 'sanne@example.com', reason: 'Ticket 4211: totals', callbackURL: 'http://localhost/' })).toBe('https://id.operator.example/authorize?state=x')
    expect(requests).toEqual([{ path: '/staff/sign-in', body: { email: 'sanne@example.com', reason: 'Ticket 4211: totals', callbackURL: 'http://localhost/' } }])
  })

  it('reads the staff sign-in behind the session, and none for the person themselves', async () => {
    expect(await serve({ '/staff/session': () => json({ staff: signIn }) }).session.staff.current()).toEqual(signIn)
    expect(await serve({ '/staff/session': () => json({ staff: null }) }).session.staff.current()).toBeUndefined()
  })

  it('forgets the token when the staff session ends', async () => {
    let tokens = 0
    const { requests, session } = serve({ '/token': () => json({ token: `${btoa('{}')}.${btoa(JSON.stringify({ exp: Date.now() / 1000 + 900, n: ++tokens }))}.s` }), '/staff/stop': () => json({ stopped: true }) })
    const first = await session.token()
    expect(await session.token()).toBe(first)
    await session.staff.stop()
    expect(await session.token()).not.toBe(first)
    expect(paths(requests)).toEqual(['/token', '/staff/stop', '/token'])
  })

  it('reads the log, and says why it cannot', async () => {
    expect(await serve({ '/staff/sign-ins': () => json({ signIns: [signIn] }) }).session.staff.log()).toEqual([signIn])
    await expect(serve({ '/staff/sign-ins': () => json({ code: 'ADMIN_ONLY', message: 'Only an admin can read the log of staff sign-ins.' }, { status: 403 }) }).session.staff.log()).rejects.toMatchObject({
      status: 403,
      code: 'ADMIN_ONLY',
    })
  })
})
