import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { betterAuthOptions, type CreateAuthOptions } from '../better-auth/create-auth'
import { roleDefinitions } from '../better-auth/organizations/role-definitions'
import { gmailSendScope, gmailSendUrl } from './gmail'
import { invalidCredentials, json, sentMessage } from './gmail-responses'
import { betterAuthLinkedAccounts, type TokenAuth } from './linked-accounts'
import { resolvePersonalMail } from './personal-mail-providers'
import { personalMailer } from './personal-mailer'

const base: CreateAuthOptions = {
  database: undefined,
  baseURL: 'https://admin.example.com',
  secret: 'test-secret-test-secret-test-secret-1234',
  socialProviders: { google: { clientId: 'client-1.apps.googleusercontent.com', clientSecret: 'client-secret' } },
  personalMail: ['gmail'],
  encryptOAuthTokens: true,
}
const password = 'correct horse battery'
const tokenEndpoint = 'https://oauth2.googleapis.com/token'
const providers = resolvePersonalMail(['gmail'], ['google'], true)

// Two Google accounts of Ada's; the code Google sends back names the one she chose. Google gives the scopes the
// account granted the app before too (`include_granted_scopes`), so a plain sign-in with A, once A connected Gmail,
// comes back with `gmail.send`.
const googleAccounts = { a: { sub: 'google-sub-a', email: 'ada.a@gmail.com' }, b: { sub: 'google-sub-b', email: 'ada.b@gmail.com' } }
type Choice = keyof typeof googleAccounts
const segment = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const tokens = (choice: Choice) => {
  const { sub, email } = googleAccounts[choice]
  const claims = { iss: 'https://accounts.google.com', aud: 'client-1.apps.googleusercontent.com', sub, email, email_verified: true, name: 'Ada' }
  return { access_token: `access-${choice}`, refresh_token: `refresh-${choice}`, id_token: `${segment({ alg: 'none' })}.${segment(claims)}.`, expires_in: 3599, scope: `openid email profile ${gmailSendScope}`, token_type: 'Bearer' }
}

// Google answers the code with the chosen account's tokens; Gmail takes a message unless `refused` names its token.
const stubGoogle = (refused: string[] = []) => {
  const sent: (string | null)[] = []
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url === tokenEndpoint) return json(tokens(new URLSearchParams(String(init?.body)).get('code') as Choice))
    if (url !== gmailSendUrl) throw new Error(`Unexpected request to ${url}`)
    const authorization = new Headers(init?.headers).get('authorization')
    sent.push(authorization)
    return refused.some((token) => authorization === `Bearer ${token}`) ? json(invalidCredentials, 401) : json(sentMessage)
  })
  return sent
}

// Better Auth with Protobase's options and Google sign-in on a store in memory, and Ada signed in with her password.
const setUp = async () => {
  const store: Record<string, Record<string, unknown>[]> = { user: [], account: [], session: [], verification: [], two_factor: [], passkey: [], sign_in_policy: [], jwks: [] }
  const resolved = { roles: ['admin', 'user'], definitions: roleDefinitions(), defaultRole: 'user' }
  // Without rate limits: Better Auth keeps their counts per process, which other test files in this worker share.
  const auth = betterAuth({ ...betterAuthOptions(base, resolved), database: memoryAdapter(store), rateLimit: { enabled: false } })
  const ada = (await auth.api.createUser({ body: { email: 'ada@example.com', password, name: 'Ada', role: 'user' } })).user
  const signedIn = await auth.api.signInEmail({ body: { email: 'ada@example.com', password }, returnHeaders: true })
  const cookies = new Map(signedIn.headers.getSetCookie().map((line) => line.split(';')[0]!.split('=') as [string, string]))
  const request = async (path: string, init: { method?: string; body?: object } = {}) => {
    const headers = { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '), origin: base.baseURL, ...(init.body && { 'content-type': 'application/json' }) }
    const response = await auth.handler(new Request(`${base.baseURL}/api/auth${path}`, { method: init.method ?? 'GET', headers, ...(init.body && { body: JSON.stringify(init.body) }) }))
    for (const line of response.headers.getSetCookie()) cookies.set(...(line.split(';')[0]!.split('=') as [string, string]))
    return { status: response.status, location: response.headers.get('location'), text: await response.text() }
  }
  // Google sends Ada back with the account she chose, after the redirect `start` answered.
  const back = async (start: { text: string }, choice: Choice) => {
    const state = new URL((JSON.parse(start.text) as { url: string }).url).searchParams.get('state')!
    const callback = await request(`/callback/google?code=${choice}&state=${state}`)
    expect(callback.status).toBe(302)
    expect(callback.location).toBe('/account')
  }
  // "Connect Gmail" on the account page, as the client's `linkPersonalMail` does.
  const connectGmail = async (choice: Choice) => {
    const [gmail] = providers
    await back(await request('/link-social', { method: 'POST', body: { provider: 'google', scopes: gmail!.scopes, additionalParams: gmail!.linkParams, callbackURL: '/account', disableRedirect: true } }), choice)
  }
  // "Continue with Google" on the sign-in page.
  const signInWithGoogle = async (choice: Choice) => back(await request('/sign-in/social', { method: 'POST', body: { provider: 'google', callbackURL: '/account', disableRedirect: true } }), choice)
  const send = () => personalMailer(betterAuthLinkedAccounts(auth as unknown as TokenAuth), providers, ada.id).send({ to: 'client@example.com', subject: 'Invoice 7', text: 'Attached.' })
  const googleRows = () => store.account!.filter((account) => account.provider_id === 'google')
  return { connectGmail, signInWithGoogle, send, googleRows }
}

describe('mail goes out through the Google account connected for mail last', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends through the one account that connected Gmail', async () => {
    const sent = stubGoogle()
    const ada = await setUp()
    await ada.connectGmail('a')
    await ada.send()
    expect(sent).toEqual(['Bearer access-a'])
  })

  it('follows the account that connected last, through a sign-in with the other and back again', async () => {
    const sent = stubGoogle()
    const ada = await setUp()
    await ada.connectGmail('a')
    await ada.connectGmail('b')
    await ada.send()

    // Signing in with A rewrites its row's tokens, as Better Auth's sign-in does, and leaves the mail with B.
    await ada.signInWithGoogle('a')
    expect(ada.googleRows()).toHaveLength(2)
    await ada.send()

    await ada.connectGmail('a')
    await ada.send()
    expect(sent).toEqual(['Bearer access-b', 'Bearer access-b', 'Bearer access-a'])
  })

  it('is link_expired, sending nothing through A, when B’s grant fails', async () => {
    const sent = stubGoogle(['access-b'])
    const ada = await setUp()
    await ada.connectGmail('a')
    await ada.connectGmail('b')
    await expect(ada.send()).rejects.toMatchObject({ code: 'link_expired', provider: 'gmail' })
    expect(sent).toEqual(['Bearer access-b'])
  })

  it('is not_linked when Ada only signed in with Google', async () => {
    const sent = stubGoogle()
    const ada = await setUp()
    await ada.signInWithGoogle('a')
    await expect(ada.send()).rejects.toMatchObject({ code: 'not_linked' })
    expect(sent).toEqual([])
  })
})
