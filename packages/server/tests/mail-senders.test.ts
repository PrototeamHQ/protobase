import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MailSenderRefusedError } from '../src/personal-mail/mail-sender-refused'
import { mcpStores, serveMcp, type McpStores } from './support/mcp-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

let stores: McpStores
beforeAll(async () => { stores = await mcpStores() })
afterAll(async () => { await stores.fixture.db.destroy() })

type Sender = { id: string; address: string; signature?: string; isDefault: boolean }
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
  it('are entered once, changed, made the default and removed by their owner', async () => {
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
  })

  it("leaves another person's addresses alone", async () => {
    const app = await served()
    const ana = await app.signIn('ana@example.com')
    const bo = await app.signIn('bo@example.com')
    const billing = await add(app, ana, { address: 'billing@acme.example' })
    const changed = await update(app, bo, { id: billing.id, signature: 'Bo' })
    expect(changed.status).toBe(404)
    expect((await app.request('/api/auth/account/mail-senders/remove', { cookie: bo, body: { id: billing.id } })).status).toBe(200)
    expect(await listed(app, bo)).toEqual([])
    expect(await listed(app, ana)).toEqual([billing])
  })

  it('serve their owner alone, also one sent as shared, until sharing proves the address is theirs', async () => {
    const app = await served()
    const ana = await app.signIn('ana@example.com')
    expect(await add(app, ana, { address: 'sales@acme.example', shared: true })).not.toHaveProperty('shared')
    await add(app, ana, { address: 'ana@private.example' })
    const anaId = await app.userId('ana@example.com')
    const boMail = app.auth.personalMailer(await app.userId('bo@example.com'))

    for (const address of ['sales@acme.example', 'ana@private.example']) await expect(boMail.sender(address)).rejects.toEqual(new MailSenderRefusedError(address))
    expect(await boMail.senders()).toEqual([])
    expect(await app.auth.personalMailer(anaId).sender('sales@acme.example')).toEqual({ address: 'sales@acme.example', ownerId: anaId })
  })
})
