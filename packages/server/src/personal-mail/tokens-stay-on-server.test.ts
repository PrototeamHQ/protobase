import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@protobase/query'
import { betterAuthOptions, type CreateAuthOptions } from '../better-auth/create-auth'
import { roleDefinitions } from '../better-auth/organizations/role-definitions'
import { createErrorHandler } from '../error-handler'
import { defineFunction } from '../functions/define-function'
import type { FunctionRecords } from '../functions/records'
import { functionRoutes } from '../functions/routes'
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

// What Google gives for the link: Better Auth reads the person from the ID token's claims.
const claims = { iss: 'https://accounts.google.com', aud: 'client-1.apps.googleusercontent.com', sub: 'google-sub-1', email: 'ada@gmail.com', email_verified: true, name: 'Ada' }
const segment = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const google = { access_token: 'ya29.access-secret', refresh_token: '1//refresh-secret', id_token: `${segment({ alg: 'none' })}.${segment(claims)}.`, expires_in: 3599, scope: `openid email profile ${gmailSendScope}`, token_type: 'Bearer' }
const secrets = [google.access_token, google.refresh_token, google.id_token]

// Better Auth with Protobase's options and Google sign-in on a store in memory, and Ada signed in with her password.
const setUp = async () => {
  const store: Record<string, Record<string, unknown>[]> = { user: [], account: [], session: [], verification: [], two_factor: [], passkey: [], sign_in_policy: [], jwks: [] }
  let instance: { $context: Promise<{ adapter: never }> } | undefined
  const resolved = { roles: ['admin', 'user'], definitions: roleDefinitions(), defaultRole: 'user', context: (() => instance!.$context) as never }
  const auth = betterAuth({ ...betterAuthOptions(base, resolved), database: memoryAdapter(store) })
  instance = auth as never
  const ada = (await auth.api.createUser({ body: { email: 'ada@example.com', password, name: 'Ada', role: 'user' } })).user
  const signedIn = await auth.api.signInEmail({ body: { email: 'ada@example.com', password }, returnHeaders: true })
  const cookies = new Map(signedIn.headers.getSetCookie().map((line) => line.split(';')[0]!.split('=') as [string, string]))
  // Every answer Ada's browser gets, for the check that none carries a Google token.
  const answers: string[] = []
  const request = async (path: string, init: { method?: string; body?: object } = {}) => {
    const headers = { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '), origin: base.baseURL, ...(init.body && { 'content-type': 'application/json' }) }
    const response = await auth.handler(new Request(`${base.baseURL}/api/auth${path}`, { method: init.method ?? 'GET', headers, ...(init.body && { body: JSON.stringify(init.body) }) }))
    for (const line of response.headers.getSetCookie()) cookies.set(...(line.split(';')[0]!.split('=') as [string, string]))
    const text = await response.text()
    answers.push(JSON.stringify([...response.headers]), text)
    return { response, text }
  }
  return { auth, store, ada, request, answers }
}

// Google's token endpoint gives `google` for the code; Gmail answers with `gmail`.
const stubGoogle = (gmail: () => Response = () => json(sentMessage)) => {
  const sent: (string | null)[] = []
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url === tokenEndpoint) return json(google)
    if (url === gmailSendUrl) return (sent.push(new Headers(init?.headers).get('authorization')), gmail())
    throw new Error(`Unexpected request to ${url}`)
  })
  return sent
}

// Ada links Gmail from the account page, as the client's `linkPersonalMail` does, and Google sends her back.
const linkGmail = async ({ request }: Awaited<ReturnType<typeof setUp>>) => {
  const [gmail] = resolvePersonalMail(['gmail'], ['google'], true)
  const start = await request('/link-social', { method: 'POST', body: { provider: 'google', scopes: gmail!.scopes, additionalParams: gmail!.linkParams, callbackURL: '/account', errorCallbackURL: '/account', disableRedirect: true } })
  const state = new URL((JSON.parse(start.text) as { url: string }).url).searchParams.get('state')!
  return request(`/callback/google?code=code-1&state=${state}`)
}

const invoice = { to: 'client@example.com', subject: 'Invoice 7', text: 'Attached.' }

describe('a linked Gmail’s tokens stay on the server', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('answers the link, its callback and the linked accounts without them, and stores them encrypted', async () => {
    stubGoogle()
    const setup = await setUp()
    const callback = await linkGmail(setup)
    expect(callback.response.status).toBe(302)
    expect(callback.response.headers.get('location')).toBe('/account')

    const stored = setup.store.account!.find((account) => account.provider_id === 'google')!
    // Better Auth encrypts the tokens that reach the mailbox; the ID token, which cannot, it keeps as Google gave it.
    for (const column of ['access_token', 'refresh_token']) {
      expect(stored[column]).toEqual(expect.any(String))
      for (const secret of secrets) expect(stored[column]).not.toContain(secret)
    }

    const listed = await setup.request('/list-accounts')
    expect(JSON.parse(listed.text)).toContainEqual(expect.objectContaining({ providerId: 'google', scopes: expect.arrayContaining([gmailSendScope]) }))
    for (const answer of setup.answers) for (const secret of secrets) expect(answer).not.toContain(secret)
  })

  it('serves no path that answers the person with them, while the server still reads them', async () => {
    const sent = stubGoogle()
    const setup = await setUp()
    await linkGmail(setup)
    const account = (JSON.parse((await setup.request('/list-accounts')).text) as { id: string; providerId: string }[]).find(({ providerId }) => providerId === 'google')
    for (const path of ['/get-access-token', '/refresh-token']) expect((await setup.request(path, { method: 'POST', body: { accountId: account!.id } })).response.status).toBe(404)
    for (const answer of setup.answers) for (const secret of secrets) expect(answer).not.toContain(secret)

    await personalMailer(betterAuthLinkedAccounts(setup.auth as unknown as TokenAuth), resolvePersonalMail(['gmail'], ['google'], true), setup.ada.id).send(invoice)
    expect(sent).toEqual([`Bearer ${google.access_token}`])
  })

  it('answers a function’s caller without them when Gmail refuses the message', async () => {
    let gmail = () => json(invalidCredentials, 401)
    stubGoogle(() => gmail())
    const setup = await setUp()
    await linkGmail(setup)
    const providers = resolvePersonalMail(['gmail'], ['google'], true)
    const app = functionRoutes({
      basePath: '/api/functions',
      functions: { send: defineFunction(async (_request, context) => (await context.personalMail.send(invoice), new Response(null, { status: 204 }))) },
      authenticate: () => ({ user: { id: setup.ada.id, roles: ['user'] }, signIn: { staff: false } }),
      access: {},
      db: {} as Db,
      records: () => ({}) as FunctionRecords,
      channels: { broadcast: async () => {} },
      decryptField: () => async () => null,
      personalMailer: (userId) => personalMailer(betterAuthLinkedAccounts(setup.auth as unknown as TokenAuth), providers, userId),
      onError: createErrorHandler(vi.fn()),
      wake: vi.fn(),
      report: vi.fn(),
    })

    const expired = await app.request('/api/functions/send')
    expect(expired.status).toBe(409)
    const problem = await expired.text()
    expect(JSON.parse(problem)).toMatchObject({ code: 'link_expired', provider: 'gmail' })

    gmail = () => new Response(`Backend Error for ${google.access_token}`, { status: 503, statusText: 'Service Unavailable' })
    const failed = await app.request('/api/functions/send')
    expect(failed.status).toBe(500)
    const failure = await failed.text()
    for (const answer of [problem, failure]) for (const secret of secrets) expect(answer).not.toContain(secret)
  })
})
