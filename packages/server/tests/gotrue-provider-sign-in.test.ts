import { Kysely } from 'kysely'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import type { MailMessage } from '../src/mail/smtp-mailer'
import { softwarePasskey } from './support/software-passkey'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

// A sign-in with a provider through GoTrue's /api/sb/auth/v1/authorize and /callback, for an app on a custom scheme.
const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const app = 'authexp://callback'
const web = 'https://app.example.com'
const email = 'root@example.com'
const password = 'correct horse battery'
const verifier = 'the-verifier-the-verifier-the-verifier-0123'
const challengeOf = async (text: string) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

// A mock GitHub: the token exchange and the two user endpoints Better Auth's GitHub provider calls.
const mockGitHub = () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(new Request(input, init).url)
    if (url.href === 'https://github.com/login/oauth/access_token') return json({ access_token: 'gho_user', token_type: 'bearer', scope: 'read:user,user:email' })
    if (url.href === 'https://api.github.com/user') return json({ id: 4242, login: 'octo', name: 'Octo Cat', email: null, avatar_url: 'https://avatars.example/4242' })
    if (url.href === 'https://api.github.com/user/emails') return json([{ email: 'octo@example.com', primary: true, verified: true }])
    throw new Error(`Unexpected request to ${url.href}`)
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

let shared: SnapshotDb
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await openSnapshotDb('auth')
  appDb = new Kysely<any>({ dialect: shared.dialect })
})

// Better Auth's rate limits are per client address and kept in memory, so every app gets an address of its own.
let client = 0

const serve = async () => {
  const store = await shared.clone()
  const sent: MailMessage[] = []
  const auth = createAuth({
    database: { dialect: store.dialect, type: 'postgres' },
    baseURL: origin,
    secret,
    mailer: { send: async (message) => void sent.push(message) },
    socialProviders: { github: { clientId: 'Iv1.client', clientSecret: 'client-secret' } },
    trustedOrigins: ['authexp://', web],
  })
  await createUser(auth, { email, password })
  const { adapter } = await auth.$context
  const served = createAdmin({ resources: [], db: appDb, authenticate: betterAuthAuthenticator({ auth }), auth })
  // Mail goes out after the answer: wait for the code mailed to `to`.
  const codeFor = async (to: string) => {
    await expect.poll(() => sent.some((mail) => mail.to === to), { timeout: 10_000 }).toBe(true)
    const code = /^\d{6}$/m.exec(sent.findLast((mail) => mail.to === to)!.text)?.[0]
    if (!code) throw new Error(`No code mailed to ${to}`)
    sent.length = 0
    return code
  }
  return { auth, app: served, adapter, store, codeFor, address: `198.51.100.${++client}` }
}

type Served = Awaited<ReturnType<typeof serve>>

// The browser's cookies: each answer's set-cookie, a cleared one removed.
const cookieJar = () => {
  const cookies = new Map<string, string>()
  return {
    take: (response: Response) => {
      for (const line of response.headers.getSetCookie()) {
        const [pair = '', ...attributes] = line.split(';')
        const [name = '', value = ''] = pair.split('=')
        if (!value || attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute))) cookies.delete(name)
        else cookies.set(name, value)
      }
      return response
    },
    header: () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
    names: () => [...cookies.keys()],
    get: (name: string) => cookies.get(name),
    set: (name: string, value: string) => void cookies.set(name, value),
    delete: (name: string) => void cookies.delete(name),
  }
}

type Jar = ReturnType<typeof cookieJar>

const sessionCookie = 'better-auth.session_token'
const flowCookie = 'better-auth.gotrue_flow'

const browse = async ({ app, address }: Served, jar: Jar, url: string) => jar.take(await app.request(url, { headers: { cookie: jar.header(), 'x-forwarded-for': address } }))

const post = async ({ app, address }: Served, jar: Jar, path: string, body: unknown) =>
  jar.take(await app.request(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, cookie: jar.header(), 'x-forwarded-for': address }, body: JSON.stringify(body) }))

const sessionIn = (served: Served, jar: Jar) => served.auth.api.getSession({ headers: new Headers({ cookie: jar.header() }) })

const authorize = async (served: Served, jar: Jar, { redirectTo = app, challenge }: { redirectTo?: string; challenge?: string } = {}) => {
  const params = new URLSearchParams({ provider: 'github', redirect_to: redirectTo, ...(challenge && { code_challenge: challenge, code_challenge_method: 's256' }) })
  return browse(served, jar, `${origin}/api/sb/auth/v1/authorize?${params}`)
}

// GitHub "approves": back to Better Auth's callback with the state of the authorization URL.
const approveAtGitHub = (served: Served, jar: Jar, authorization: string) => {
  const state = new URL(authorization).searchParams.get('state') ?? ''
  return browse(served, jar, `${origin}/api/auth/callback/github?code=the-code&state=${encodeURIComponent(state)}`)
}

// A web sign-in with GitHub on the app itself, which leaves a session in the browser.
const signInOnTheWeb = async (served: Served, jar: Jar) => {
  const start = await post(served, jar, '/api/auth/sign-in/social', { provider: 'github', callbackURL: `${origin}/`, disableRedirect: true })
  await approveAtGitHub(served, jar, ((await start.json()) as { url: string }).url)
  expect(await sessionIn(served, jar)).toBeTruthy()
}

// Sign-ins of root that never pass the provider, each leaving a session in the browser.
const signInWithPassword = async (served: Served, jar: Jar) => {
  expect((await post(served, jar, '/api/auth/sign-in/email', { email, password })).status).toBe(200)
}

const signInWithCode = async (served: Served, jar: Jar) => {
  expect((await post(served, jar, '/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' })).status).toBe(200)
  expect((await post(served, jar, '/api/auth/sign-in/email-otp', { email, otp: await served.codeFor(email) })).status).toBe(200)
}

const signInWithPasskey = async (served: Served, jar: Jar) => {
  const key = softwarePasskey()
  const root = await served.adapter.findOne<{ id: string }>({ model: 'user', where: [{ field: 'email', value: email }] })
  await served.adapter.create({ model: 'passkey', data: { userId: root!.id, credentialID: key.id, publicKey: key.publicKey, counter: 0, deviceType: 'singleDevice', backedUp: false, transports: 'internal', createdAt: new Date() } })
  const options = await browse(served, jar, `${origin}/api/auth/passkey/generate-authenticate-options`)
  const { challenge } = (await options.json()) as { challenge: string }
  expect((await post(served, jar, '/api/auth/passkey/verify-authentication', { response: key.answer({ challenge, rpId: 'localhost', origin }) })).status).toBe(200)
}

const location = (response: Response) => {
  expect(response.status).toBe(302)
  return new URL(response.headers.get('location') ?? '')
}

const withoutQuery = (url: URL) => `${url.protocol}//${url.host}${url.pathname}`

const trade = async (served: Served, code: string | null, codeVerifier = verifier) =>
  served.app.request(`${origin}/api/sb/auth/v1/token?grant_type=pkce`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': served.address }, body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier }) })

// /authorize, then GitHub's approval: Better Auth's success redirect to /callback, not yet followed.
const approvedFlow = async (served: Served, jar: Jar, options: { redirectTo?: string; challenge?: string } = {}) => {
  const toCallback = location(await approveAtGitHub(served, jar, location(await authorize(served, jar, options)).href))
  expect(toCallback.pathname).toBe('/api/sb/auth/v1/callback')
  return toCallback
}

const expectDenied = (back: URL, where: 'search' | 'hash' = 'search') => {
  const params = where === 'search' ? back.searchParams : new URLSearchParams(back.hash.slice(1))
  expect(params.get('error')).toBe('access_denied')
  expect(back.searchParams.get('code')).toBeNull()
  expect(back.hash).not.toContain('access_token')
}

describe('GoTrue sign-in with a provider', () => {
  it('hands no code to a /callback that no /authorize started, even with a session in the browser', async () => {
    mockGitHub()
    const served = await serve()
    const jar = cookieJar()
    await signInOnTheWeb(served, jar)

    const callback = location(await browse(served, jar, `${origin}/api/sb/auth/v1/callback?redirect_to=${encodeURIComponent(app)}&code_challenge=${await challengeOf('attacker')}&code_challenge_method=s256`))
    expectDenied(callback)

    const implicit = location(await browse(served, jar, `${origin}/api/sb/auth/v1/callback?redirect_to=${encodeURIComponent(app)}`))
    expect(implicit.hash).not.toContain('access_token')

    // An untrusted redirect_to falls back to the app itself, with nothing in it.
    const untrusted = location(await browse(served, jar, `${origin}/api/sb/auth/v1/callback?redirect_to=${encodeURIComponent('https://evil.example')}`))
    expect(untrusted.origin).toBe(origin)
    expectDenied(untrusted, 'hash')
  })

  it('hands no code to a flow that skips the provider, for the session the browser had before it', async () => {
    mockGitHub()
    const served = await serve()
    const jar = cookieJar()
    await signInOnTheWeb(served, jar)

    await authorize(served, jar, { challenge: await challengeOf('attacker') })
    expectDenied(location(await browse(served, jar, `${origin}/api/sb/auth/v1/callback`)))
  })

  it.each([
    ['a password', signInWithPassword],
    ['an emailed code', signInWithCode],
    ['a passkey', signInWithPasskey],
  ])('hands no code for a sign-in with %s that comes after an abandoned flow', async (_, signIn) => {
    const served = await serve()
    const jar = cookieJar()
    await authorize(served, jar, { challenge: await challengeOf('attacker') })
    await signIn(served, jar)

    expectDenied(location(await browse(served, jar, `${origin}/api/sb/auth/v1/callback`)))
    // Nothing was handed off, so nothing was signed out.
    expect(await sessionIn(served, jar)).toBeTruthy()
  })

  it('answers a code for the flow /authorize started, and leaves no session in the browser', async () => {
    mockGitHub()
    const served = await serve()
    const jar = cookieJar()

    const toCallback = await approvedFlow(served, jar, { challenge: await challengeOf(verifier) })
    expect(toCallback.searchParams.get('flow')).toBeTruthy()
    const spent = jar.header()
    const handedOff = await browse(served, jar, toCallback.href)
    const back = location(handedOff)
    expect(withoutQuery(back)).toBe(app)
    const code = back.searchParams.get('code')
    expect(code).toBeTruthy()

    // The browser is told to drop its session, and the session is gone on the server too.
    const cleared = handedOff.headers.getSetCookie().filter((line) => /max-age=0/i.test(line)).map((line) => line.split('=')[0])
    expect(cleared).toEqual(expect.arrayContaining([sessionCookie, 'better-auth.session_data', 'better-auth.dont_remember']))
    expect(await served.auth.api.getSession({ headers: new Headers({ cookie: spent }) })).toBeNull()
    expect(await sessionIn(served, jar)).toBeNull()
    expect(jar.names().some((name) => name.endsWith('session_token'))).toBe(false)

    const token = await trade(served, code)
    expect(token.status).toBe(200)
    expect(((await token.json()) as { user: { email: string } }).user.email).toBe('octo@example.com')

    // The flow is spent: the same /callback again hands out nothing.
    const again = location(await browse(served, jar, toCallback.href))
    expect(again.searchParams.get('code')).toBeNull()
    expect(again.hash).toContain('error=access_denied')
  })

  it('hands a code to a browser that was signed in before the flow, for the session the provider made', async () => {
    mockGitHub()
    const served = await serve()
    const jar = cookieJar()
    await signInWithPassword(served, jar)

    const back = location(await browse(served, jar, (await approvedFlow(served, jar, { challenge: await challengeOf(verifier) })).href))
    expect(withoutQuery(back)).toBe(app)
    expect((await trade(served, back.searchParams.get('code'))).status).toBe(200)
  })

  it('hands no code for the session the browser had before the flow, even with the flow\'s secret', async () => {
    mockGitHub()
    const served = await serve()
    const jar = cookieJar()
    await signInWithPassword(served, jar)
    const before = jar.get(sessionCookie)!

    const toCallback = await approvedFlow(served, jar, { challenge: await challengeOf(verifier) })
    jar.set(sessionCookie, before)
    expectDenied(location(await browse(served, jar, toCallback.href)))
  })

  it('hands a secret\'s code only to the browser whose flow it belongs to', async () => {
    mockGitHub()
    const served = await serve()
    const a = cookieJar()
    const toCallback = await approvedFlow(served, a, { challenge: await challengeOf(verifier) })

    // Another browser, with a flow and a session of its own.
    const b = cookieJar()
    await authorize(served, b, { challenge: await challengeOf('attacker') })
    await signInWithPassword(served, b)
    expectDenied(location(await browse(served, b, toCallback.href)))

    // A's own session, but without its flow cookie: the address alone mints nothing.
    const flow = a.get(flowCookie)!
    a.delete(flowCookie)
    const unknown = location(await browse(served, a, toCallback.href))
    expect(unknown.origin).toBe(origin)
    expectDenied(unknown, 'hash')
    a.set(flowCookie, flow)

    const back = location(await browse(served, a, toCallback.href))
    expect((await trade(served, back.searchParams.get('code'))).status).toBe(200)
  })

  it('hands no code for a secret that is not the flow\'s', async () => {
    mockGitHub()
    const served = await serve()
    const jar = cookieJar()
    await approvedFlow(served, jar, { challenge: await challengeOf(verifier) })
    expectDenied(location(await browse(served, jar, `${origin}/api/sb/auth/v1/callback?flow=not-the-secret`)))
  })

  it('hands no code when the provider answers an error, even with the flow\'s secret', async () => {
    mockGitHub()
    const served = await serve()
    const jar = cookieJar()
    const toCallback = await approvedFlow(served, jar, { challenge: await challengeOf(verifier) })
    toCallback.searchParams.set('error', 'access_denied')
    const back = location(await browse(served, jar, toCallback.href))
    expect(withoutQuery(back)).toBe(app)
    expectDenied(back)
  })

  it('sends a provider error to /callback without the secret', async () => {
    const served = await serve()
    const jar = cookieJar()
    const state = new URL(location(await authorize(served, jar, { challenge: await challengeOf(verifier) })).href).searchParams.get('state')!
    const toCallback = location(await browse(served, jar, `${origin}/api/auth/callback/github?error=access_denied&state=${encodeURIComponent(state)}`))
    expect(toCallback.pathname).toBe('/api/sb/auth/v1/callback')
    expect(toCallback.searchParams.get('flow')).toBeNull()
    const back = location(await browse(served, jar, toCallback.href))
    expect(withoutQuery(back)).toBe(app)
    expectDenied(back)
  })

  it('ignores a redirect_to and code_challenge in /callback\'s own address', async () => {
    mockGitHub()
    const served = await serve()
    const jar = cookieJar()
    const toCallback = await approvedFlow(served, jar, { challenge: await challengeOf(verifier) })
    toCallback.searchParams.set('redirect_to', web)
    toCallback.searchParams.set('code_challenge', await challengeOf('attacker'))
    const back = location(await browse(served, jar, toCallback.href))
    expect(withoutQuery(back)).toBe(app)
    expect((await trade(served, back.searchParams.get('code'))).status).toBe(200)
  })

  it('hands no code for an expired flow', async () => {
    mockGitHub()
    const served = await serve()
    const jar = cookieJar()
    const authorization = location(await authorize(served, jar, { challenge: await challengeOf(verifier) }))
    await served.store.query(`update verification set expires_at = $1 where identifier like 'gotrue-provider-flow-%'`, [new Date(Date.now() - 60_000)])
    const toCallback = location(await approveAtGitHub(served, jar, authorization.href))
    const back = location(await browse(served, jar, toCallback.href))
    expect(back.origin).toBe(origin)
    expectDenied(back, 'hash')
  })

  it('sends the code to the app itself for an untrusted redirect_to', async () => {
    mockGitHub()
    const served = await serve()
    const jar = cookieJar()
    const back = location(await browse(served, jar, (await approvedFlow(served, jar, { redirectTo: 'https://evil.example', challenge: await challengeOf(verifier) })).href))
    expect(back.origin).toBe(origin)
    expect((await trade(served, back.searchParams.get('code'))).status).toBe(200)
  })

  it('refuses a redirect_to that is not https without a code_challenge', async () => {
    const served = await serve()
    for (const query of [`redirect_to=${encodeURIComponent(app)}`, `redirect_to=${encodeURIComponent('http://localhost:5173')}`, '']) {
      const authorize = await browse(served, cookieJar(), `${origin}/api/sb/auth/v1/authorize?provider=github&${query}`)
      expect(authorize.status).toBe(400)
      expect(await authorize.json()).toMatchObject({ error_code: 'validation_failed' })
    }
  })

  it('hands an https redirect_to its session in the fragment, and leaves no session in the browser', async () => {
    mockGitHub()
    const served = await serve()
    const jar = cookieJar()
    const back = location(await browse(served, jar, (await approvedFlow(served, jar, { redirectTo: web })).href))
    expect(back.origin).toBe(web)
    const fragment = new URLSearchParams(back.hash.slice(1))
    expect(fragment.get('access_token')).toBeTruthy()
    expect(fragment.get('refresh_token')).toBeTruthy()
    expect(await sessionIn(served, jar)).toBeNull()
  })
})
