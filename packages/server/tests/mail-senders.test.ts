import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { base64url } from 'jose'
import { sql } from 'kysely'
import { f, resource } from '@protobase/schema'
import { gmailSendScope, gmailSendUrl } from '../src/personal-mail/gmail'
import { invalidCredentials, json, sendAsList, sentMessage } from '../src/personal-mail/gmail-responses'
import { gmailSendAsUrl, gmailSettingsScope } from '../src/personal-mail/gmail-sender-addresses'
import { sqlSenderStore } from '../src/personal-mail/sender-store'
import { storeSqlOf } from '../src/better-auth/store/store-sql'
import { MailSenderRefusedError } from '../src/personal-mail/mail-sender-refused'
import { mcpStores, serveMcp, type McpStores } from './support/mcp-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

let stores: McpStores
beforeAll(async () => { stores = await mcpStores() })
afterAll(async () => { await stores.fixture.db.destroy() })

type Sender = { id: string; address: string; name?: string; signature?: string; isDefault: boolean; state: string; connection?: string; listedAt?: string }
type Served = Awaited<ReturnType<typeof serveMcp>>

const personalMail = { personalMail: ['gmail' as const], encryptOAuthTokens: true, socialProviders: { google: { clientId: 'client-1.apps.googleusercontent.com', clientSecret: 'client-secret' } } }
const served = () => serveMcp(stores, { auth: personalMail })

const add = async (app: Served, cookie: string, body: object) => {
  const response = await app.request('/api/auth/account/mail-senders/add', { cookie, body })
  expect(response.status, await response.clone().text()).toBe(200)
  return ((await response.json()) as { sender: Sender }).sender
}

const update = async (app: Served, cookie: string, body: object) => app.request('/api/auth/account/mail-senders/update', { cookie, body })

// By address: the tests run on a clock that stands still, so rows made one after another were made at the same time.
const listed = async (app: Served, cookie: string) =>
  ((await (await app.request('/api/auth/account/mail-senders', { cookie })).json()) as { senders: Sender[] }).senders.toSorted((a, b) => a.address.localeCompare(b.address))

// The fixture's labels as an app's clients, each with the address its mail goes out from.
const clients = resource('clients')
  .table('labels')
  .fields({ id: f.integer().readOnly().filterable(), organizationId: f.integer(), name: f.text(), sendFrom: f.mailSender().optional().column('color') })
  .primaryKey((r) => r.id)
  // A rule on the address as stored: an address given as Billing@Acme.example is stored as the sender spells it.
  .validate((client) => (typeof client.sendFrom === 'string' && /@acme\.example$/i.test(client.sendFrom) && client.sendFrom !== client.sendFrom.toLowerCase() ? [{ field: 'sendFrom', message: 'Acme addresses are lowercase' }] : undefined))

const withClients = () => serveMcp(stores, { auth: personalMail, resources: [clients] })

// A Gmail linked to the person, as linking it leaves it: its scopes send mail, and with `settings` read its send-as
// addresses; its ID token names its own address; its access token has not expired.
const linkGmail = async (app: Served, email: string, address: string, settings = false) => {
  const idToken = `${base64url.encode(JSON.stringify({ alg: 'none' }))}.${base64url.encode(JSON.stringify({ sub: address, email: address, email_verified: true }))}.`
  const { internalAdapter } = await app.auth.$context
  const scope = settings ? `${gmailSendScope},${gmailSettingsScope}` : gmailSendScope
  return internalAdapter.createAccount({ userId: await app.userId(email), providerId: 'google', accountId: `google-${address}`, scope, idToken, accessToken: `access-${address}`, accessTokenExpiresAt: new Date(Date.now() + 3_600_000) })
}

// Gmail's send-as list for each access token, at the network's edge, and the messages it sent.
const stubGmail = (lists: Record<string, object>) => {
  const sent: string[] = []
  const listed: string[] = []
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const token = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '') ?? ''
    if (url === gmailSendUrl) {
      sent.push(new TextDecoder().decode(init!.body as Uint8Array))
      return json(sentMessage)
    }
    if (url !== gmailSendAsUrl) throw new Error(`Unexpected request to ${url}`)
    listed.push(token)
    const list = lists[token]
    return list ? json(list) : json(invalidCredentials, 401, 'Unauthorized')
  })
  return { sent, listed }
}

const store = async (app: Served) => {
  const context = await app.auth.$context
  return sqlSenderStore(async () => storeSqlOf(context))
}

describe('the From addresses on the account page', () => {
  it('are typed once on the mailbox mail goes through, changed, made the default and removed by their owner, with the display name they enter', async () => {
    const app = await served()
    const cookie = await app.signIn('ana@example.com')
    const noMailbox = await app.request('/api/auth/account/mail-senders/add', { cookie, body: { address: 'billing@acme.example' } })
    expect(noMailbox.status).toBe(400)
    expect(await noMailbox.json()).toMatchObject({ code: 'MAILBOX_NOT_FOUND' })
    const gmail = await linkGmail(app, 'ana@example.com', 'ana@gmail.example')

    const billing = await add(app, cookie, { address: 'Billing@Acme.example', signature: 'Warm regards,\nAna' })
    expect(billing).toEqual({ id: expect.any(String), address: 'billing@acme.example', signature: 'Warm regards,\nAna', isDefault: false, state: 'unverified', connection: gmail.id })
    const sales = await add(app, cookie, { address: 'sales@acme.example' })

    const twice = await app.request('/api/auth/account/mail-senders/add', { cookie, body: { address: 'billing@acme.example' } })
    expect(twice.status).toBe(400)
    expect(await twice.json()).toMatchObject({ code: 'MAIL_SENDER_EXISTS' })

    expect((await update(app, cookie, { id: billing.id, isDefault: true })).status).toBe(200)
    expect((await update(app, cookie, { id: sales.id, isDefault: true, signature: '  ' })).status).toBe(200)
    expect(await listed(app, cookie)).toEqual([
      { ...billing, isDefault: false },
      { ...sales, isDefault: true },
    ])

    expect((await update(app, cookie, { id: sales.id, isDefault: false })).status).toBe(200)
    expect((await app.request('/api/auth/account/mail-senders/remove', { cookie, body: { id: billing.id } })).status).toBe(200)
    expect(await listed(app, cookie)).toEqual([{ ...sales, isDefault: false }])
    expect((await update(app, cookie, { id: billing.id, name: 'Gone' })).status).toBe(404)

    // The display name, which the From header shows beside the address, until they clear it.
    const ops = await add(app, cookie, { address: 'ops@acme.example', name: '  Ana of Acme ' })
    expect(ops).toMatchObject({ address: 'ops@acme.example', name: 'Ana of Acme', isDefault: false })
    const anaMail = app.auth.personalMailer(await app.userId('ana@example.com'))
    expect(await anaMail.sender('ops@acme.example')).toMatchObject({ id: ops.id, address: 'ops@acme.example', name: 'Ana of Acme', state: 'unverified' })
    const broken = await update(app, cookie, { id: ops.id, name: 'Ana\r\nBcc: eve@example.com' })
    expect(broken.status).toBe(400)
    const opsNow = async () => (await listed(app, cookie)).find(({ id }) => id === ops.id)
    expect((await update(app, cookie, { id: ops.id, name: 'Acme ops' })).status).toBe(200)
    expect(await opsNow()).toEqual({ ...ops, name: 'Acme ops' })
    expect((await update(app, cookie, { id: ops.id, name: null })).status).toBe(200)
    const { name: _, ...unnamed } = ops
    expect(await opsNow()).toEqual(unnamed)

    // Removed, then typed again: the same record comes back.
    expect((await add(app, cookie, { address: 'billing@acme.example' })).id).toBe(billing.id)
  })

  it('refuse an address or display name that would break the From header', async () => {
    const app = await served()
    const cookie = await app.signIn('ana@example.com')
    await linkGmail(app, 'ana@example.com', 'ana@gmail.example')
    for (const body of [{ address: 'billing@acme.example\r\nBcc: eve@example.com' }, { address: 'Billing <billing@acme.example>' }, { address: 'billing@acme.example', name: 'Ana\nBcc: eve@example.com' }]) {
      expect((await app.request('/api/auth/account/mail-senders/add', { cookie, body })).status).toBe(400)
    }
    expect(await listed(app, cookie)).toEqual([])
  })

  it('record a typed address as unverified, whatever the request says of its state', async () => {
    const app = await served()
    const cookie = await app.signIn('ana@example.com')
    await linkGmail(app, 'ana@example.com', 'ana@gmail.example')
    const billing = await add(app, cookie, { address: 'billing@acme.example', state: 'verified', verified: true, listedAt: '2026-01-01T00:00:00Z', providerState: 'verified' })
    expect(billing).toMatchObject({ state: 'unverified' })
    expect(billing).not.toHaveProperty('listedAt')
  })

  it("serve their owner alone: another person's id or connection is not found, and nothing is done with it", async () => {
    const app = await served()
    const ana = await app.signIn('ana@example.com')
    const bo = await app.signIn('bo@example.com')
    const anaGmail = await linkGmail(app, 'ana@example.com', 'ana@gmail.example')
    await linkGmail(app, 'bo@example.com', 'bo@gmail.example')
    const billing = await add(app, ana, { address: 'billing@acme.example' })

    expect((await update(app, bo, { id: billing.id, name: 'Bo', signature: 'Bo' })).status).toBe(404)
    const removal = await app.request('/api/auth/account/mail-senders/remove', { cookie: bo, body: { id: billing.id } })
    expect(removal.status).toBe(404)
    expect(await removal.json()).toEqual({ code: 'MAIL_SENDER_NOT_FOUND', message: 'This address is not one of yours.' })
    const onAnas = await app.request('/api/auth/account/mail-senders/add', { cookie: bo, body: { address: 'bo@acme.example', connection: anaGmail.id } })
    expect(onAnas.status).toBe(404)
    expect(await listed(app, bo)).toEqual([])
    expect(await listed(app, ana)).toEqual([billing])

    expect(await add(app, ana, { address: 'sales@acme.example', shared: true })).not.toHaveProperty('shared')
    const boMail = app.auth.personalMailer(await app.userId('bo@example.com'))
    for (const address of ['sales@acme.example', 'billing@acme.example']) await expect(boMail.sender(address)).rejects.toEqual(new MailSenderRefusedError(address))
    await expect(boMail.send({ to: 'x@example.com', subject: 'Hi', text: 'Hi', sender_address_id: billing.id })).rejects.toMatchObject({ status: 404 })
    expect((await boMail.senders()).map(({ address }) => address)).toEqual(['bo@gmail.example'])
  })
})

describe('the send-as addresses a mailbox lists', () => {
  const listing = { auth: { ...personalMail, personalMail: [{ provider: 'gmail' as const, scopes: [gmailSettingsScope] }] } }
  afterEach(() => vi.unstubAllGlobals())

  it("come in with Gmail's own state on a refresh, and a connection without the scope is told which it lacks", async () => {
    const app = await serveMcp(stores, listing)
    const ana = await app.signIn('ana@example.com')
    const bo = await app.signIn('bo@example.com')
    const anaGmail = await linkGmail(app, 'ana@example.com', 'ana@acme.example', true)
    await linkGmail(app, 'bo@example.com', 'bo@gmail.example')
    stubGmail({ 'access-ana@acme.example': sendAsList })
    const typed = await add(app, ana, { address: 'billing@acme.example' })

    const refreshed = await app.request('/api/auth/account/mail-senders/refresh', { cookie: ana, body: {} })
    expect(await refreshed.json()).toEqual({ connections: [{ connection: anaGmail.id, provider: 'gmail', status: 'listed' }] })
    const states = Object.fromEntries((await listed(app, ana)).map((sender) => [sender.address, [sender.id, sender.state]]))
    expect(states).toEqual({
      'billing@acme.example': [typed.id, 'verified'],
      'ana@acme.example': [expect.any(String), 'verified'],
      'sales@acme.example': [expect.any(String), 'pending'],
      'old@acme.example': [expect.any(String), 'unverified'],
    })

    const boRefresh = await (await app.request('/api/auth/account/mail-senders/refresh', { cookie: bo, body: {} })).json()
    expect(boRefresh).toEqual({ connections: [{ connection: expect.any(String), provider: 'gmail', status: 'not_permitted', missing_scopes: [gmailSettingsScope] }] })
    expect(await (await app.request('/api/auth/account/mail-senders', { cookie: bo })).json()).toMatchObject({ senders: [], connections: [{ provider: 'gmail', canList: true, missingScopes: [gmailSettingsScope] }] })
  })

  it('keep their records and ids: a listing without an address only clears what it listed, and a failed listing changes nothing', async () => {
    const app = await serveMcp(stores, listing)
    const ana = await app.signIn('ana@example.com')
    await linkGmail(app, 'ana@example.com', 'ana@acme.example', true)
    const gmail = stubGmail({ 'access-ana@acme.example': sendAsList })
    await app.request('/api/auth/account/mail-senders/refresh', { cookie: ana, body: {} })
    const before = await listed(app, ana)

    const fewer = { sendAs: sendAsList.sendAs.filter(({ sendAsEmail }) => sendAsEmail !== 'billing@acme.example') }
    stubGmail({ 'access-ana@acme.example': fewer })
    await app.request('/api/auth/account/mail-senders/refresh', { cookie: ana, body: {} })
    const after = await listed(app, ana)
    expect(after.map(({ id }) => id)).toEqual(before.map(({ id }) => id))
    expect(after.find(({ address }) => address === 'billing@acme.example')).toMatchObject({ state: 'failed' })
    expect(after.find(({ address }) => address === 'billing@acme.example')).not.toHaveProperty('listedAt')

    stubGmail({})
    const failed = await (await app.request('/api/auth/account/mail-senders/refresh', { cookie: ana, body: {} })).json()
    expect(failed).toMatchObject({ connections: [{ status: 'error', code: 'link_expired' }] })
    expect(await listed(app, ana)).toEqual(after)
    expect(gmail.listed).toHaveLength(1)
  })

  it('keep what a person typed and what a listing said of the same address alike', async () => {
    const app = await serveMcp(stores, listing)
    const ana = await app.signIn('ana@example.com')
    const gmail = await linkGmail(app, 'ana@example.com', 'ana@acme.example', true)
    const senders = await store(app)
    const userId = await app.userId('ana@example.com')
    const readAt = new Date(Date.now() - 1000)
    // Typed and listed at the same moment: each keeps what it wrote.
    const [typed] = await Promise.all([
      senders.type({ userId, connectionId: gmail.id, address: 'billing@acme.example', name: 'Billing', signature: null }, new Date()),
      senders.recordListing(userId, gmail.id, [{ address: 'billing@acme.example', provider_state: 'verified' }, { address: 'sales@acme.example', provider_state: 'verified' }], readAt),
    ])
    const rows = await senders.ofUser(userId)
    expect(rows).toHaveLength(2)
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: typed.id, name: 'Billing', typedAt: expect.any(Date), listedAt: readAt, providerState: 'verified' }),
        expect.objectContaining({ address: 'sales@acme.example', typedAt: null, providerState: 'verified' }),
      ]),
    )

    // Typed over an address the listing vouches for: only what typing writes changes.
    const sales = await add(app, ana, { address: 'SALES@acme.example', name: 'Acme sales' })
    expect(sales).toMatchObject({ name: 'Acme sales', state: 'verified' })
    expect((await senders.ofUser(userId)).find(({ id }) => id === sales.id)).toMatchObject({ typedAt: expect.any(Date), listedAt: readAt, providerState: 'verified', providerStateReadAt: readAt })
  })

  it('go out only once the listing vouches for them: an address it does not hold is refused before the first send', async () => {
    const app = await serveMcp(stores, listing)
    const ana = await app.signIn('ana@example.com')
    await linkGmail(app, 'ana@example.com', 'ana@acme.example', true)
    const gmail = stubGmail({ 'access-ana@acme.example': sendAsList })
    const typo = await add(app, ana, { address: 'bilign@acme.example' })
    const billing = await add(app, ana, { address: 'billing@acme.example' })
    const mail = app.auth.personalMailer(await app.userId('ana@example.com'))
    const message = { to: 'client@example.com', subject: 'Invoice 7', text: 'Attached.' }

    await expect(mail.send({ ...message, sender_address_id: typo.id })).rejects.toMatchObject({ status: 409, code: 'sender_address_failed' })
    expect(gmail.sent).toEqual([])
    await mail.send({ ...message, sender_address_id: billing.id })
    expect(gmail.sent).toHaveLength(1)
    expect(gmail.sent[0]).toMatch(/^From: billing@acme\.example$/m)
    expect(gmail.listed).toHaveLength(1)
  })
})

const rest = async (app: Served, cookie: string) => {
  const token = ((await (await app.request('/api/auth/token', { cookie })).json()) as { token: string }).token
  return (path: string, init: { method?: string; body?: object } = {}) =>
    app.request(`/api/v1/${path}`, { ...(init.method && { method: init.method }), ...(init.body && { body: init.body }), headers: { authorization: `Bearer ${token}`, ...(init.method === 'PATCH' && { 'if-match': '*' }) } })
}

type Client = { id: number; sendFrom: string | null }

describe('a mail sender field', () => {
  it('holds an address the person saving may send from, as their sender spells it, which its rules see, and refuses any other', async () => {
    const app = await withClients()
    const ana = await app.signIn('ana@example.com')
    await linkGmail(app, 'ana@example.com', 'Ana@Gmail.example')
    await add(app, ana, { address: 'billing@acme.example' })
    const api = await rest(app, ana)

    const created = await api('clients', { body: { organizationId: 1, name: 'Initech', sendFrom: 'Billing@Acme.example' } })
    expect(created.status, await created.clone().text()).toBe(201)
    const client = (await created.json()) as Client
    expect(client.sendFrom).toBe('billing@acme.example')
    const mailbox = await api(`clients/${client.id}`, { method: 'PATCH', body: { sendFrom: 'ana@gmail.example' } })
    expect(((await mailbox.json()) as Client).sendFrom).toBe('Ana@Gmail.example')

    const bo = await rest(app, await app.signIn('bo@example.com'))
    const refused = await bo(`clients/${client.id}`, { method: 'PATCH', body: { sendFrom: 'billing@acme.example' } })
    expect(refused.status).toBe(400)
    expect(await refused.json()).toMatchObject({ errors: [{ field: 'sendFrom', code: 'invalid-value', params: { address: 'billing@acme.example' } }] })
    expect((await bo('clients', { body: { organizationId: 1, name: 'Hooli', sendFrom: 'nobody@acme.example' } })).status).toBe(400)

    // Bo has no such address, yet an edit that leaves it as stored, or changes another field, keeps it as it is.
    const kept = await bo(`clients/${client.id}`, { method: 'PATCH', body: { name: 'Initech BV', sendFrom: 'ANA@gmail.example' } })
    expect(kept.status, await kept.clone().text()).toBe(200)
    expect(await kept.json()).toMatchObject({ name: 'Initech BV', sendFrom: 'Ana@Gmail.example' })
    expect((await bo(`clients/${client.id}`, { method: 'PATCH', body: { sendFrom: null } })).status).toBe(200)
  })

  it('keeps an address from being removed, or its mailbox disconnected, while a record holds it in any case', async () => {
    const app = await withClients()
    const ana = await app.signIn('ana@example.com')
    const gmail = await linkGmail(app, 'ana@example.com', 'Ana@Gmail.example')
    const billing = await add(app, ana, { address: 'billing@acme.example' })
    const api = await rest(app, ana)
    const client = (await (await api('clients', { body: { organizationId: 1, name: 'Initech', sendFrom: 'billing@acme.example' } })).json()) as Client
    const other = (await (await api('clients', { body: { organizationId: 1, name: 'Hooli', sendFrom: 'ana@gmail.example' } })).json()) as Client
    // As held before the mailbox's ID token spelled its address otherwise.
    await sql`update labels set color = 'ana@gmail.example' where id = ${other.id}`.execute(stores.fixture.db)

    const removal = await app.request('/api/auth/account/mail-senders/remove', { cookie: ana, body: { id: billing.id } })
    expect(removal.status).toBe(409)
    const refusal = await removal.json()
    expect(refusal).toEqual({ code: 'MAIL_SENDER_IN_USE', message: 'billing@acme.example is still the From address of records in this app. Give them another From address first.' })
    expect(await listed(app, ana)).toEqual([billing])
    const unlink = await app.request('/api/auth/unlink-account', { cookie: ana, body: { accountId: gmail.id } })
    expect(unlink.status).toBe(409)
    expect(await unlink.json()).toMatchObject({ code: 'MAIL_SENDER_IN_USE' })

    for (const { id } of [client, other]) expect((await api(`clients/${id}`, { method: 'PATCH', body: { sendFrom: null } })).status).toBe(200)
    expect((await app.request('/api/auth/account/mail-senders/remove', { cookie: ana, body: { id: billing.id } })).status).toBe(200)
    expect(await listed(app, ana)).toEqual([])
    expect((await app.request('/api/auth/unlink-account', { cookie: ana, body: { accountId: gmail.id } })).status).toBe(200)
  })
})
