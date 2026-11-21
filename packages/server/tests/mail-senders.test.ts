import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { base64url } from 'jose'
import { sql } from 'kysely'
import { f, resource } from '@protobase/schema'
import { gmailSendScope } from '../src/personal-mail/gmail'
import { MailSenderRefusedError } from '../src/personal-mail/mail-sender-refused'
import { mcpStores, serveMcp, type McpStores } from './support/mcp-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

let stores: McpStores
beforeAll(async () => { stores = await mcpStores() })
afterAll(async () => { await stores.fixture.db.destroy() })

type Sender = { id: string; address: string; name?: string; signature?: string; isDefault: boolean }
type Served = Awaited<ReturnType<typeof serveMcp>>

const personalMail = { personalMail: ['gmail' as const], encryptOAuthTokens: true, socialProviders: { google: { clientId: 'client-1.apps.googleusercontent.com', clientSecret: 'client-secret' } } }
const served = () => serveMcp(stores, { auth: personalMail })

const add = async (app: Served, cookie: string, body: object) => {
  const response = await app.request('/api/auth/account/mail-senders/add', { cookie, body })
  expect(response.status, await response.clone().text()).toBe(200)
  return ((await response.json()) as { sender: Sender }).sender
}

const update = async (app: Served, cookie: string, body: object) => app.request('/api/auth/account/mail-senders/update', { cookie, body })

const listed = async (app: Served, cookie: string) => ((await (await app.request('/api/auth/account/mail-senders', { cookie })).json()) as { senders: Sender[] }).senders

describe('the From addresses on the account page', () => {
  it('are entered once, changed, made the default and removed by their owner, with the display name they enter', async () => {
    const app = await served()
    const cookie = await app.signIn('ana@example.com')
    const billing = await add(app, cookie, { address: 'Billing@Acme.example', signature: 'Warm regards,\nAna' })
    expect(billing).toEqual({ id: expect.any(String), address: 'billing@acme.example', signature: 'Warm regards,\nAna', isDefault: false })
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

    // The display name, which the From header shows beside the address, until they clear it.
    const ops = await add(app, cookie, { address: 'ops@acme.example', name: '  Ana of Acme ' })
    expect(ops).toEqual({ id: ops.id, address: 'ops@acme.example', name: 'Ana of Acme', isDefault: false })
    const anaMail = app.auth.personalMailer(await app.userId('ana@example.com'))
    expect(await anaMail.sender('ops@acme.example')).toMatchObject({ address: 'ops@acme.example', name: 'Ana of Acme' })
    const broken = await update(app, cookie, { id: ops.id, name: 'Ana\r\nBcc: eve@example.com' })
    expect(broken.status).toBe(400)
    expect((await update(app, cookie, { id: ops.id, name: 'Acme ops' })).status).toBe(200)
    expect((await listed(app, cookie))[1]).toEqual({ ...ops, name: 'Acme ops' })
    expect((await update(app, cookie, { id: ops.id, name: null })).status).toBe(200)
    expect((await listed(app, cookie))[1]).toEqual({ id: ops.id, address: 'ops@acme.example', isDefault: false })
  })

  it("serve their owner alone, also one sent as shared, and leave another person's alone", async () => {
    const app = await served()
    const ana = await app.signIn('ana@example.com')
    const bo = await app.signIn('bo@example.com')
    const billing = await add(app, ana, { address: 'billing@acme.example' })
    const changed = await update(app, bo, { id: billing.id, name: 'Bo', signature: 'Bo' })
    expect(changed.status).toBe(404)
    expect((await app.request('/api/auth/account/mail-senders/remove', { cookie: bo, body: { id: billing.id } })).status).toBe(200)
    expect(await listed(app, bo)).toEqual([])
    expect(await listed(app, ana)).toEqual([billing])

    expect(await add(app, ana, { address: 'sales@acme.example', shared: true })).not.toHaveProperty('shared')
    const anaId = await app.userId('ana@example.com')
    const boMail = app.auth.personalMailer(await app.userId('bo@example.com'))
    for (const address of ['sales@acme.example', 'billing@acme.example']) await expect(boMail.sender(address)).rejects.toEqual(new MailSenderRefusedError(address))
    expect(await boMail.senders()).toEqual([])
    expect(await app.auth.personalMailer(anaId).sender('sales@acme.example')).toEqual({ address: 'sales@acme.example', ownerId: anaId })
  })
})

// The fixture's labels as an app's clients, each with the address its mail goes out from.
const clients = resource('clients')
  .table('labels')
  .fields({ id: f.integer().readOnly().filterable(), organizationId: f.integer(), name: f.text(), sendFrom: f.mailSender().optional().column('color') })
  .primaryKey((r) => r.id)
  // A rule on the address as stored: an address given as Billing@Acme.example is stored as the sender spells it.
  .validate((client) => (typeof client.sendFrom === 'string' && /@acme\.example$/i.test(client.sendFrom) && client.sendFrom !== client.sendFrom.toLowerCase() ? [{ field: 'sendFrom', message: 'Acme addresses are lowercase' }] : undefined))

const withClients = () => serveMcp(stores, { auth: personalMail, resources: [clients] })

// A Gmail linked to the person, as linking it leaves it: its scope sends mail, its ID token names its own address.
const linkGmail = async (app: Served, email: string, address: string) => {
  const idToken = `${base64url.encode(JSON.stringify({ alg: 'none' }))}.${base64url.encode(JSON.stringify({ sub: address, email: address, email_verified: true }))}.`
  const { internalAdapter } = await app.auth.$context
  return internalAdapter.createAccount({ userId: await app.userId(email), providerId: 'google', accountId: `google-${address}`, scope: gmailSendScope, idToken })
}

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
    await add(app, ana, { address: 'billing@acme.example' })
    await linkGmail(app, 'ana@example.com', 'Ana@Gmail.example')
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
    const billing = await add(app, ana, { address: 'billing@acme.example' })
    const gmail = await linkGmail(app, 'ana@example.com', 'Ana@Gmail.example')
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
