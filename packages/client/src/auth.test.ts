import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthError, createAuthSession, tokenExpiry } from './auth'
import { createClient } from './client'
import { ApiError } from './problem'

const jwt = (expiresInMs: number) => {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${encode({ alg: 'EdDSA' })}.${encode({ exp: Math.floor((Date.now() + expiresInMs) / 1000) })}.signature`
}

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...init.headers } })

describe('tokenExpiry', () => {
  it('reads exp from the payload in milliseconds', () => {
    const token = jwt(10 * 60_000)
    expect(tokenExpiry(token) - Date.now()).toBeGreaterThan(9 * 60_000)
  })
  it('rejects things that are not tokens', () => {
    expect(() => tokenExpiry('nope')).toThrow('Not a JWT')
  })
})

describe('auth session tokens', () => {
  const setup = (respond: (path: string) => Response) => {
    const calls: string[] = []
    const fetch = (async (input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost').pathname
      calls.push(path)
      return respond(path)
    }) as typeof globalThis.fetch
    return { calls, session: createAuthSession({ origin: 'http://localhost', fetch, onSignedOut: vi.fn() }) }
  }

  it('keeps the token in memory and reuses it until it is about to expire', async () => {
    const token = jwt(15 * 60_000)
    const { calls, session } = setup(() => json({ token }))
    expect(await session.token()).toBe(token)
    expect(await session.token()).toBe(token)
    expect(calls.filter((path) => path.endsWith('/token'))).toHaveLength(1)
  })

  it('fetches a new token inside the refresh margin', async () => {
    const { calls, session } = setup(() => json({ token: jwt(30_000) }))
    await session.token()
    await session.token()
    expect(calls.filter((path) => path.endsWith('/token'))).toHaveLength(2)
  })

  it('shares one request between concurrent callers and refreshes on demand', async () => {
    const { calls, session } = setup(() => json({ token: jwt(15 * 60_000) }))
    await Promise.all([session.token(), session.token(), session.token()])
    expect(calls.filter((path) => path.endsWith('/token'))).toHaveLength(1)
    await session.token({ refresh: true })
    expect(calls.filter((path) => path.endsWith('/token'))).toHaveLength(2)
  })

  it('has no token when the session is gone', async () => {
    const { session } = setup(() => json({ message: 'Unauthorized' }, { status: 401 }))
    expect(await session.token()).toBeUndefined()
  })
})

describe('deleting the account', () => {
  const setup = (respond: (path: string) => Response) => {
    const calls: { path: string; body: unknown }[] = []
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      calls.push({ path, body: request.method === 'POST' ? await request.json() : undefined })
      return respond(path)
    }) as typeof globalThis.fetch
    return { calls, session: createAuthSession({ origin: 'http://localhost', fetch, onSignedOut: vi.fn() }) }
  }

  it('sends the password when given, and forgets the token once the account is gone', async () => {
    const { calls, session } = setup((path) => (path.endsWith('/token') ? json({ token: jwt(15 * 60_000) }) : json({ success: true, message: 'User deleted' })))
    await session.token()
    await session.deleteAccount('secret')
    expect(calls.find((call) => call.path.endsWith('/delete-user'))?.body).toEqual({ password: 'secret' })
    await session.token()
    expect(calls.filter((call) => call.path.endsWith('/token'))).toHaveLength(2)
  })

  it('rejects with the server\'s code, such as LAST_ADMIN', async () => {
    const { calls, session } = setup(() => json({ message: 'This is the last admin', code: 'LAST_ADMIN' }, { status: 400 }))
    await expect(session.deleteAccount()).rejects.toMatchObject({ status: 400, code: 'LAST_ADMIN' })
    expect(calls.find((call) => call.path.endsWith('/delete-user'))?.body).toEqual({})
  })
})

describe('auth session sign-in', () => {
  it('turns Better Auth errors into AuthError', async () => {
    const session = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ message: 'Invalid email or password', code: 'INVALID_EMAIL_OR_PASSWORD' }, { status: 401 })) as typeof fetch })
    const error = (await session.signIn('a@b.c', 'wrong').catch((e: unknown) => e)) as AuthError
    expect(error).toBeInstanceOf(AuthError)
    expect(error.message).toBe('Invalid email or password')
    expect(error.status).toBe(401)
    expect(error.code).toBe('INVALID_EMAIL_OR_PASSWORD')
  })

  it('reads the setup status, with passwords only from a server that does not list sign-in methods', async () => {
    const open = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ needsAdmin: true })) as typeof fetch })
    expect(await open.status()).toEqual({ needsAdmin: true, signInMethods: ['password'], passwordReset: false, socialProviders: [], samlProviders: [] })
    const hosted = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ needsAdmin: true, firstAdminUrl: 'https://console.example.com/apps/1' })) as typeof fetch })
    expect(await hosted.status()).toMatchObject({ needsAdmin: true, firstAdminUrl: 'https://console.example.com/apps/1' })
    const added = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ needsAdmin: false, firstAdminUrl: 'https://console.example.com/apps/1' })) as typeof fetch })
    expect(await added.status()).not.toHaveProperty('firstAdminUrl')
    const deletable = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ needsAdmin: false, accountDeletion: true })) as typeof fetch })
    expect(await deletable.status()).toMatchObject({ accountDeletion: true })
    const resettable = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ needsAdmin: false, signInMethods: ['emailCode', 'passkey'], passwordReset: true, changeEmail: true, socialProviders: ['github'] })) as typeof fetch })
    expect(await resettable.status()).toEqual({ needsAdmin: false, signInMethods: ['emailCode', 'passkey'], passwordReset: true, changeEmail: true, socialProviders: ['github'], samlProviders: [] })
    const browsable = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ needsAdmin: false, signInMethods: ['password'], socialProviders: [], anonymous: true })) as typeof fetch })
    expect(await browsable.status()).toMatchObject({ anonymous: true })
    const signUp = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ needsAdmin: false, signInMethods: ['password'], socialProviders: [], signUp: true })) as typeof fetch })
    expect(await signUp.status()).toMatchObject({ signUp: true })
    const platform = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ needsAdmin: false, signInMethods: ['password'], socialProviders: ['github'], platformSignIn: { provider: 'github', name: 'GitHub' } })) as typeof fetch })
    expect(await platform.status()).toMatchObject({ socialProviders: ['github'], platformSignIn: { provider: 'github', name: 'GitHub' } })
    const saml = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ needsAdmin: false, signInMethods: ['password'], socialProviders: [], samlProviders: [{ id: 'okta', name: 'Okta' }] })) as typeof fetch })
    expect((await saml.status()).samlProviders).toEqual([{ id: 'okta', name: 'Okta' }])
    const early = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ needsAdmin: false, signInMethods: ['password'], socialProviders: [], plugins: [{ url: 'https://cloud.example.com/plugin.json' }] })) as typeof fetch })
    expect(await early.status()).toMatchObject({ plugins: [{ url: 'https://cloud.example.com/plugin.json' }] })
    const dutch = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ needsAdmin: false, signInMethods: ['password'], socialProviders: [], locale: 'nl' })) as typeof fetch })
    expect(await dutch.status()).toMatchObject({ locale: 'nl' })
    const unknown = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ needsAdmin: false, signInMethods: ['password'], socialProviders: [], locale: 'xx' })) as typeof fetch })
    expect(await unknown.status()).not.toHaveProperty('locale')
    const mcp = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ needsAdmin: false, signInMethods: ['password'], socialProviders: [], mcp: { url: 'http://localhost/tools/mcp' } })) as typeof fetch })
    expect(await mcp.status()).toMatchObject({ mcp: { url: 'http://localhost/tools/mcp' } })
    expect(await early.status()).not.toHaveProperty('mcp')
    const codeFirst = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ needsAdmin: false, signInMethods: ['password', 'emailCode'], socialProviders: [], signInFirst: 'emailCode' })) as typeof fetch })
    expect(await codeFirst.status()).toMatchObject({ signInFirst: 'emailCode' })
    expect(await early.status()).not.toHaveProperty('signInFirst')
  })

  it('says so when the URL is not a Protobase server', async () => {
    const elsewhere = createAuthSession({ origin: 'http://localhost', fetch: (async () => new Response('Not found', { status: 404 })) as typeof fetch })
    await expect(elsewhere.status()).rejects.toMatchObject({ name: 'AuthError', status: 404 })
  })
})

describe('auth session sign-in with a provider', () => {
  it('asks for the authorization URL, coming back to the page either way, without navigating itself', async () => {
    const requests: Array<{ path: string; body: unknown }> = []
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push({ path: new URL(request.url).pathname, body: await request.json() })
      return json({ url: 'https://github.com/login/oauth/authorize?client_id=Iv1.client', redirect: false })
    }) as typeof globalThis.fetch
    const session = createAuthSession({ origin: 'http://localhost', fetch })
    expect(await session.signInSocial('github', 'http://localhost/orders')).toBe('https://github.com/login/oauth/authorize?client_id=Iv1.client')
    expect(requests).toEqual([{ path: '/api/auth/sign-in/social', body: { provider: 'github', callbackURL: 'http://localhost/orders', errorCallbackURL: 'http://localhost/orders', disableRedirect: true } }])
  })

  it('asks a SAML provider for its sign-in URL by its id, coming back to the page either way', async () => {
    const requests: Array<{ path: string; body: unknown }> = []
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push({ path: new URL(request.url).pathname, body: await request.json() })
      return json({ url: 'https://idp.example.com/sso?SAMLRequest=request', redirect: true })
    }) as typeof globalThis.fetch
    const session = createAuthSession({ origin: 'http://localhost', fetch })
    expect(await session.signInSaml('okta', 'http://localhost/orders')).toBe('https://idp.example.com/sso?SAMLRequest=request')
    expect(requests).toEqual([{ path: '/api/auth/sign-in/sso', body: { providerId: 'okta', callbackURL: 'http://localhost/orders', errorCallbackURL: 'http://localhost/orders' } }])
    const missing = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ message: 'No SAML provider okta' }, { status: 404 })) as typeof fetch })
    await expect(missing.signInSaml('okta', 'http://localhost/')).rejects.toMatchObject({ name: 'AuthError', status: 404 })
  })

  it('reports a provider the server does not have as AuthError', async () => {
    const session = createAuthSession({ origin: 'http://localhost', fetch: (async () => json({ message: 'Provider not found', code: 'PROVIDER_NOT_FOUND' }, { status: 404 })) as typeof fetch })
    await expect(session.signInSocial('github', 'http://localhost/')).rejects.toMatchObject({ name: 'AuthError', status: 404, code: 'PROVIDER_NOT_FOUND' })
  })
})

describe('auth session password reset', () => {
  const recording = (response: Response) => {
    const requests: Array<{ path: string; body: unknown }> = []
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push({ path: new URL(request.url).pathname, body: await request.json() })
      return response
    }) as typeof globalThis.fetch
    return { requests, session: createAuthSession({ origin: 'http://localhost', fetch }) }
  }

  it('asks for a reset link that leads back to the given page', async () => {
    const { requests, session } = recording(json({ status: true }))
    await session.requestPasswordReset('a@b.c', 'http://localhost/?password-reset')
    expect(requests).toEqual([{ path: '/api/auth/request-password-reset', body: { email: 'a@b.c', redirectTo: 'http://localhost/?password-reset' } }])
  })

  it('sets the new password with the token, and reports a used or expired one as AuthError', async () => {
    const { requests, session } = recording(json({ message: 'Invalid token', code: 'INVALID_TOKEN' }, { status: 400 }))
    const error = (await session.resetPassword('t0ken', 'a new long password').catch((e: unknown) => e)) as AuthError
    expect(requests).toEqual([{ path: '/api/auth/reset-password', body: { token: 't0ken', newPassword: 'a new long password' } }])
    expect(error).toBeInstanceOf(AuthError)
    expect(error.code).toBe('INVALID_TOKEN')
  })
})

describe('bearer tokens on API calls', () => {
  const problem = (status: number) => new Response(JSON.stringify({ type: 'urn:protobase:problem:unauthenticated', title: 'Unauthorized', status }), { status, headers: { 'content-type': 'application/problem+json' } })

  it('attaches the token', async () => {
    const seen: Array<string | undefined> = []
    const fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push((init?.headers as Record<string, string>).authorization)
      return json({ items: [], next_page_token: '', total_size_estimate: 0 })
    }) as typeof globalThis.fetch
    await createClient({ fetch, token: async () => 'abc' }).list('orders')
    expect(seen).toEqual(['Bearer abc'])
  })

  it('retries once with a refreshed token after a 401', async () => {
    const refreshes: boolean[] = []
    const statuses: Array<string | undefined> = []
    const fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const header = (init?.headers as Record<string, string>).authorization
      statuses.push(header)
      return header === 'Bearer fresh' ? json({ items: [], next_page_token: '', total_size_estimate: 0 }) : problem(401)
    }) as typeof globalThis.fetch
    const onUnauthenticated = vi.fn()
    const client = createClient({ fetch, token: async ({ refresh }) => (refreshes.push(refresh), refresh ? 'fresh' : 'stale'), onUnauthenticated })
    await client.list('orders')
    expect(statuses).toEqual(['Bearer stale', 'Bearer fresh'])
    expect(refreshes).toEqual([false, true])
    expect(onUnauthenticated).not.toHaveBeenCalled()
  })

  it('reports the end of the session after a second 401', async () => {
    const onUnauthenticated = vi.fn()
    const fetch = (async () => problem(401)) as typeof globalThis.fetch
    const error = await createClient({ fetch, token: async () => 'x', onUnauthenticated }).list('orders').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(onUnauthenticated).toHaveBeenCalledTimes(1)
  })

  it('does not retry without a token source', async () => {
    const fetch = vi.fn(async () => problem(401)) as unknown as typeof globalThis.fetch
    await createClient({ fetch }).list('orders').catch(() => undefined)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('the connect page calls', () => {
  afterEach(() => vi.unstubAllGlobals())

  const answering = (body: unknown, status = 200) => createAuthSession({ origin: 'http://localhost', fetch: (async () => json(body, { status })) as typeof fetch })

  it('resolve with where to go next', async () => {
    expect(await answering({ redirect: true, url: '/-/connect?sig=x' }).connect.resume('sig=x')).toEqual({ url: '/-/connect?sig=x' })
    expect(await answering({ redirect: true, url: 'http://127.0.0.1:3000/cb?code=c' }).connect.answer(true, 'sig=x')).toEqual({ url: 'http://127.0.0.1:3000/cb?code=c' })
  })

  // The provider answers the page's own calls with `redirect: true`: going there at once would load the page again on a
  // newly signed request, which it would pick up and be sent back with, without end.
  it('leave the browser where it is, for the page to go on', async () => {
    const href = vi.fn()
    vi.stubGlobal('window', { location: { set href(url: string) { href(url) } } })
    await answering({ redirect: true, url: '/-/connect?sig=y' }).connect.resume('sig=x')
    await answering({ redirect: true, url: 'http://127.0.0.1:3000/cb?code=c' }).connect.answer(true, 'sig=x')
    expect(href).not.toHaveBeenCalled()
  })

  it("reject with the provider's OAuth error as the code, and Protobase's own refusals as theirs", async () => {
    const expired = await answering({ error: 'invalid_signature', error_description: 'invalid signature' }, 400).connect.resume('sig=x').catch((error: unknown) => error)
    expect(expired).toBeInstanceOf(AuthError)
    expect(expired).toMatchObject({ status: 400, code: 'invalid_signature', message: 'invalid signature' })
    const staff = await answering({ code: 'STAFF_CANNOT_CONNECT', message: 'Staff cannot allow apps to act for a person.' }, 403).connect.answer(true, 'sig=x').catch((error: unknown) => error)
    expect(staff).toMatchObject({ status: 403, code: 'STAFF_CANNOT_CONNECT' })
  })
})
