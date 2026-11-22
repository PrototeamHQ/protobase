import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { base64url } from 'jose'
import { gmailSendScope, gmailSendUrl } from '../src/personal-mail/gmail'
import { sentMessage } from '../src/personal-mail/gmail-responses'
import { issued, json, notReceived, receivedFrom, token } from '../src/personal-mail/mail-check-responses'
import { mailCheckPaths } from '../src/personal-mail/mail-check-service'
import { mailCheckSecret } from '../src/personal-mail/mail-check-signing'
import { verifyStandardWebhook } from '../src/functions/verify-signature'
import { mcpStores, serveMcp, type McpStores } from './support/mcp-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

let stores: McpStores
beforeAll(async () => { stores = await mcpStores() })
afterAll(async () => { await stores.fixture.db.destroy() })
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const personalMail = { personalMail: ['gmail' as const], encryptOAuthTokens: true, socialProviders: { google: { clientId: 'client-1.apps.googleusercontent.com', clientSecret: 'client-secret' } } }
const checkUrl = 'https://checks.example/apps/7/mail-checks'
const paths = mailCheckPaths(checkUrl)
type Served = Awaited<ReturnType<typeof serveMcp>>

// Ana's Gmail, linked with an access token that has not expired, whose own address is ana@gmail.example.
const linkGmail = async (app: Served) => {
  const idToken = `${base64url.encode(JSON.stringify({ alg: 'none' }))}.${base64url.encode(JSON.stringify({ sub: 'ana', email: 'ana@gmail.example', email_verified: true }))}.`
  const { internalAdapter } = await app.auth.$context
  await internalAdapter.createAccount({ userId: await app.userId('ana@example.com'), providerId: 'google', accountId: 'google-ana', scope: gmailSendScope, idToken, accessToken: 'access-1', accessTokenExpiresAt: new Date(Date.now() + 3_600_000) })
}

// The mail check service and Gmail at the network's edge: the service's answers to its signed calls in turn, and the messages Gmail sent.
const stubNetwork = (results: object[]) => {
  const sent: string[] = []
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url === gmailSendUrl) {
      sent.push(new TextDecoder().decode(init!.body as Uint8Array))
      return json(sentMessage)
    }
    const body = JSON.parse(await verifyStandardWebhook(new Request(url, init), { secret: mailCheckSecret('platform-secret') })) as { token?: string }
    if (url === paths.issue) return json(issued, 201)
    if (url === paths.result && body.token === token) return json(results.shift())
    throw new Error(`Unexpected request to ${url}`)
  })
  return sent
}

const check = async (app: Served, cookie: string, id: string) => (await app.request('/api/auth/account/mail-senders/check', { cookie, body: { id } })).json()
const result = async (app: Served, cookie: string, id: string, check: string) => (await app.request('/api/auth/account/mail-senders/check-result', { cookie, body: { id, check } })).json()

const added = async (app: Served, cookie: string, address: string) =>
  ((await (await app.request('/api/auth/account/mail-senders/add', { cookie, body: { address } })).json()) as { sender: { id: string } }).sender.id

describe('checking a From address', () => {
  it("sends a test message from it through the person's Gmail to the service's one-time address, and reports the From it arrived with", async () => {
    vi.stubEnv('PROTOBASE_MAIL_CHECK_URL', checkUrl)
    vi.stubEnv('PROTOBASE_SECRET', 'platform-secret')
    const sent = stubNetwork([notReceived, receivedFrom('ana@gmail.example'), receivedFrom('Billing@Shop.example')])
    const app = await serveMcp(stores, { auth: personalMail })
    const cookie = await app.signIn('ana@example.com')
    await linkGmail(app)
    const billing = await added(app, cookie, 'billing@shop.example')
    expect(await (await app.request('/api/auth/account/mail-senders', { cookie })).json()).toMatchObject({ checks: true })

    expect(await check(app, cookie, billing)).toEqual({ status: 'waiting', check: token })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatch(/^From: billing@shop\.example$/m)
    // A header line this long is folded.
    expect(sent[0]).toMatch(new RegExp(`^To:\\s+${issued.address}$`, 'm'))
    expect(await result(app, cookie, billing, token)).toEqual({ status: 'waiting' })
    expect(await result(app, cookie, billing, token)).toEqual({ status: 'mismatch', from: 'ana@gmail.example' })
    expect(await result(app, cookie, billing, token)).toEqual({ status: 'confirmed', from: 'Billing@Shop.example' })

    // Another person's address is not theirs to check.
    const bo = await app.signIn('bo@example.com')
    expect((await app.request('/api/auth/account/mail-senders/check', { cookie: bo, body: { id: billing } })).status).toBe(404)
    expect(sent).toHaveLength(1)
  })

  it('leaves addresses unchecked, sending nothing, where the platform names no mail check service', async () => {
    const sent = stubNetwork([])
    const app = await serveMcp(stores, { auth: personalMail })
    const cookie = await app.signIn('ana@example.com')
    await linkGmail(app)
    const billing = await added(app, cookie, 'billing@shop.example')
    expect(await (await app.request('/api/auth/account/mail-senders', { cookie })).json()).toMatchObject({ checks: false })
    expect(await check(app, cookie, billing)).toEqual({ status: 'unchecked' })
    expect(await result(app, cookie, billing, token)).toEqual({ status: 'unchecked' })
    expect(sent).toEqual([])
  })
})
