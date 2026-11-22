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

// A Gmail of the person's, linked with an access token that has not expired, whose own address is `address`; the one
// linked last is the one mail goes through.
const linkGmail = async (app: Served, email = 'ana@example.com', address = 'ana@gmail.example', createdAt = new Date()) => {
  const idToken = `${base64url.encode(JSON.stringify({ alg: 'none' }))}.${base64url.encode(JSON.stringify({ sub: address, email: address, email_verified: true }))}.`
  const { internalAdapter } = await app.auth.$context
  return internalAdapter.createAccount({ userId: await app.userId(email), providerId: 'google', accountId: `google-${address}`, scope: gmailSendScope, idToken, accessToken: 'access-1', accessTokenExpiresAt: new Date(Date.now() + 3_600_000), createdAt })
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

const verifiedAtOf = async (app: Served, id: string) => (await app.store.query<{ verified_at: Date | null }>('select verified_at from mail_sender where id = $1', [id])).rows[0]?.verified_at

const added = async (app: Served, cookie: string, address: string) =>
  ((await (await app.request('/api/auth/account/mail-senders/add', { cookie, body: { address } })).json()) as { sender: { id: string } }).sender.id

type Listed = { id: string; address: string; verified: boolean; shared: boolean }
const listed = async (app: Served, cookie: string) => ((await (await app.request('/api/auth/account/mail-senders', { cookie })).json()) as { senders: Listed[] }).senders
const update = (app: Served, cookie: string, body: object) => app.request('/api/auth/account/mail-senders/update', { cookie, body })
const resultCall = (app: Served, cookie: string, id: string, check: string) => app.request('/api/auth/account/mail-senders/check-result', { cookie, body: { id, check } })

const withChecks = () => {
  vi.stubEnv('PROTOBASE_MAIL_CHECK_URL', checkUrl)
  vi.stubEnv('PROTOBASE_SECRET', 'platform-secret')
}

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
    expect((await listed(app, cookie))[0]).toMatchObject({ verified: false })
    // Once set up in Gmail, a check again confirms it, and the address is verified.
    expect(await check(app, cookie, billing)).toEqual({ status: 'waiting', check: token })
    expect(await result(app, cookie, billing, token)).toEqual({ status: 'confirmed', from: 'Billing@Shop.example' })
    expect((await listed(app, cookie))[0]).toMatchObject({ verified: true, shared: false })

    // Another person's address is not theirs to check.
    const bo = await app.signIn('bo@example.com')
    expect((await app.request('/api/auth/account/mail-senders/check', { cookie: bo, body: { id: billing } })).status).toBe(404)
    expect(sent).toHaveLength(2)
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

describe('a check result', () => {
  it('answers once: asked again, for another address or by another person it is refused, and changes nothing', async () => {
    withChecks()
    stubNetwork([receivedFrom('billing@shop.example'), receivedFrom('billing@shop.example')])
    const app = await serveMcp(stores, { auth: personalMail })
    const cookie = await app.signIn('ana@example.com')
    await linkGmail(app)
    const billing = await added(app, cookie, 'billing@shop.example')
    const sales = await added(app, cookie, 'sales@shop.example')
    await check(app, cookie, billing)

    // A check of billing@ does not prove sales@, and Bo has no such address.
    const elsewhere = await resultCall(app, cookie, sales, token)
    expect(elsewhere.status).toBe(400)
    expect(await elsewhere.json()).toMatchObject({ code: 'MAIL_SENDER_CHECK_INVALID' })
    expect((await resultCall(app, await app.signIn('bo@example.com'), billing, token)).status).toBe(404)
    expect((await resultCall(app, cookie, billing, 'made-up')).status).toBe(400)

    expect(await result(app, cookie, billing, token)).toEqual({ status: 'confirmed', from: 'billing@shop.example' })
    const verifiedAt = await verifiedAtOf(app, billing)
    const replay = await resultCall(app, cookie, billing, token)
    expect(replay.status).toBe(400)
    expect(await replay.json()).toMatchObject({ code: 'MAIL_SENDER_CHECK_INVALID' })
    expect(verifiedAt).not.toBeNull()
    expect(await verifiedAtOf(app, billing)).toEqual(verifiedAt)
    expect((await listed(app, cookie)).map(({ address, verified }) => [address, verified]).toSorted()).toEqual([['billing@shop.example', true], ['sales@shop.example', false]])
  })

  it('is refused once mail goes through another mailbox than the test message did', async () => {
    withChecks()
    stubNetwork([receivedFrom('billing@shop.example')])
    const app = await serveMcp(stores, { auth: personalMail })
    const cookie = await app.signIn('ana@example.com')
    await linkGmail(app)
    const billing = await added(app, cookie, 'billing@shop.example')
    await check(app, cookie, billing)
    await linkGmail(app, 'ana@example.com', 'ana.work@gmail.example', new Date(Date.now() + 60_000))
    expect((await resultCall(app, cookie, billing, token)).status).toBe(400)
    expect((await listed(app, cookie))[0]).toMatchObject({ verified: false })
  })
})

describe('sharing a From address', () => {
  it('needs a passed check, takes no proof from the request, and is the owner\'s alone to change', async () => {
    withChecks()
    stubNetwork([receivedFrom('billing@shop.example')])
    const app = await serveMcp(stores, { auth: personalMail })
    const ana = await app.signIn('ana@example.com')
    const bo = await app.signIn('bo@example.com')
    const gmail = await linkGmail(app)
    await linkGmail(app, 'bo@example.com', 'bo@gmail.example')
    const billing = await added(app, ana, 'billing@shop.example')
    const boMail = app.auth.personalMailer(await app.userId('bo@example.com'))

    const unproven = await update(app, ana, { id: billing, shared: true, verified: true, verifiedAt: new Date().toISOString(), verifiedAccountId: gmail.id })
    expect(unproven.status).toBe(400)
    expect(await unproven.json()).toMatchObject({ code: 'MAIL_SENDER_NOT_VERIFIED' })
    expect((await listed(app, ana))[0]).toMatchObject({ verified: false, shared: false })
    // Unsharing never needs a check.
    expect((await update(app, ana, { id: billing, shared: false })).status).toBe(200)
    await expect(boMail.sender('billing@shop.example')).rejects.toMatchObject({ status: 403 })

    await check(app, ana, billing)
    await result(app, ana, billing, token)
    // A verified address stays Ana's alone until she shares it.
    await expect(boMail.sender('billing@shop.example')).rejects.toMatchObject({ status: 403 })
    for (const shared of [true, false]) expect((await update(app, bo, { id: billing, shared })).status).toBe(404)
    expect((await listed(app, ana))[0]).toMatchObject({ verified: true, shared: false })

    expect((await update(app, ana, { id: billing, shared: true })).status).toBe(200)
    const anaId = await app.userId('ana@example.com')
    expect(await boMail.sender('billing@shop.example')).toEqual({ address: 'billing@shop.example', ownerId: anaId })
    expect(await boMail.senders()).toContainEqual({ address: 'billing@shop.example', ownerId: anaId })
    expect((await update(app, bo, { id: billing, shared: false })).status).toBe(404)

    // Disconnecting the mailbox the check went through ends the proof, and with it the sharing.
    const { internalAdapter } = await app.auth.$context
    await internalAdapter.deleteAccount(gmail.id)
    expect((await listed(app, ana))[0]).toMatchObject({ verified: false, shared: true })
    await expect(boMail.sender('billing@shop.example')).rejects.toMatchObject({ status: 403 })
  })
})
