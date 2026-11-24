import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { namesOf } from '../src/better-auth/names/names-plugin'
import { resolveNames } from '../src/better-auth/names/resolve-names'
import { storeSqlOf } from '../src/better-auth/store/store-sql'
import { sharedSenderReader } from '../src/personal-mail/shared-sender-store'
import { mcpStores, type McpStores } from './support/mcp-app'
import { farAhead, servedWith, testVerifier } from './support/verifier-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

let stores: McpStores
beforeAll(async () => { stores = await mcpStores() })
afterAll(async () => { await stores.fixture.db.destroy() })
afterEach(() => vi.unstubAllGlobals())

const message = { to: 'client@example.com', subject: 'Invoice 7', text: 'Attached.' }

// Ana's app, with her billing address proved by the test verifier, and Bo signed in beside her with no mailbox.
const sharing = async () => {
  const { verifier, inputs } = testVerifier()
  const served = await servedWith(stores, [verifier])
  const { app, cookie, add, verify, report } = served
  const billing = await add('billing@shop.example')
  const share = (id: string, as = cookie) => app.request('/api/auth/account/mail-senders/share', { cookie: as, body: { id } })
  const unshare = (id: string, as = cookie) => app.request('/api/auth/account/mail-senders/unshare', { cookie: as, body: { id } })
  const prove = async () => {
    await verify(billing)
    expect((await report({ verifier: 'test-mail', secret: inputs.at(-1)!.secret, state: 'verified', valid_until: farAhead })).status).toBe(200)
  }
  const bo = await app.signIn('bo@example.com')
  const boList = async () => (await app.request('/api/auth/account/mail-senders', { cookie: bo })).text()
  const boMail = app.auth.personalMailer(await app.userId('bo@example.com'))
  return { ...served, billing, share, unshare, prove, bo, boList, boMail, anaId: await app.userId('ana@example.com') }
}

describe('sharing a From address', () => {
  it('is refused until the address is verified, and for anyone but its owner, changing nothing', async () => {
    const { billing, share, unshare, prove, bo, list } = await sharing()
    const early = await share(billing)
    expect(early.status).toBe(409)
    expect(await early.json()).toMatchObject({ code: 'MAIL_SENDER_NOT_VERIFIED' })
    await prove()
    for (const response of [await share(billing, bo), await unshare(billing, bo)]) {
      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({ code: 'MAIL_SENDER_NOT_FOUND' })
    }
    expect((await list()).senders.find(({ id }) => id === billing)).not.toHaveProperty('sharedAt')
  })

  it('lets the app’s other senders pick it and send from it through the owner’s mailbox, until it is unshared', async () => {
    const { billing, share, unshare, prove, boList, boMail, sent, anaId, list } = await sharing()
    await prove()
    const shared = await share(billing)
    expect(shared.status).toBe(200)
    expect(await shared.json()).toMatchObject({ sender: { id: billing, state: 'verified', sharedAt: expect.any(String) } })
    expect((await list()).senders.find(({ id }) => id === billing)).toMatchObject({ sharedAt: expect.any(String) })

    const listed = await boList()
    expect(JSON.parse(listed)).toMatchObject({ senders: [], shared: [{ id: billing, address: 'billing@shop.example' }] })
    expect(JSON.parse(listed).shared[0]).toEqual({ id: billing, address: 'billing@shop.example' })
    for (const owner of [anaId, 'ana@', 'google-ana']) expect(listed).not.toContain(owner)
    expect(await boMail.sender('Billing@shop.example')).toEqual({ id: billing, address: 'billing@shop.example', shared: true, state: 'verified' })

    await boMail.send({ ...message, sender_address_id: billing })
    expect(sent.at(-1)).toMatch(/^From: billing@shop\.example$/m)
    const before = sent.length

    expect((await unshare(billing)).status).toBe(200)
    await expect(boMail.send({ ...message, sender_address_id: billing })).rejects.toMatchObject({ status: 404 })
    expect(JSON.parse(await boList())).toMatchObject({ shared: [] })
    expect(sent).toHaveLength(before)
  })

  it('stops going out once its proof runs out, and tells the sender its owner must connect their mailbox again once that is gone', async () => {
    const { app, billing, share, prove, boList, boMail, sent, anaId } = await sharing()
    await prove()
    expect((await share(billing)).status).toBe(200)
    const before = sent.length

    await app.store.query(`update mail_sender_verification set valid_until = '2000-01-01' where sender_id = $1`, [billing])
    await expect(boMail.send({ ...message, sender_address_id: billing })).rejects.toMatchObject({ status: 404 })
    expect(JSON.parse(await boList())).toMatchObject({ shared: [] })

    await app.store.query(`update mail_sender_verification set valid_until = $2 where sender_id = $1`, [billing, farAhead])
    await app.store.query(`delete from account where user_id = $1 and provider_id = 'google'`, [anaId])
    const refusal = await boMail.send({ ...message, sender_address_id: billing }).catch((error: unknown) => error)
    expect(refusal).toMatchObject({ status: 409, code: 'sender_address_owner_unlinked' })
    expect(JSON.stringify(refusal)).not.toContain(anaId)
    expect(sent).toHaveLength(before)
  })

  it('is no change staff signed in as the owner may make', async () => {
    const { app, billing, share, unshare, prove, anaId } = await sharing()
    await prove()
    await app.store.query(`update session set impersonated_by = 'alex@operator.example' where user_id = $1`, [anaId])
    for (const response of [await share(billing), await unshare(billing)]) {
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ code: 'STAFF_CANNOT_CHANGE_SIGN_IN' })
    }
  })

  it('reaches, with organizations, only the people who share one with its owner', async () => {
    const { app, billing, share, prove, anaId } = await sharing()
    await prove()
    expect((await share(billing)).status).toBe(200)
    const boId = await app.userId('bo@example.com')
    const rootId = await app.userId('root@example.com')
    await app.store.query(`insert into organization (id, name, slug, created_at) values ('o1', 'Shop', 'shop', '2026-08-01'), ('o2', 'Other', 'other', '2026-08-01')`)
    await app.store.query(`insert into member (id, organization_id, user_id, role, created_at) values ('m1', 'o1', $1, 'member', '2026-08-01'), ('m2', 'o1', $2, 'member', '2026-08-01'), ('m3', 'o2', $3, 'member', '2026-08-01')`, [anaId, boId, rootId])
    const context = await app.auth.$context
    // The app has organizations off; the reader over the same store with their tables named, as an app with them on reads it.
    const store = storeSqlOf(context)
    const members = resolveNames({ ...namesOf(context).input, modules: [...namesOf(context).modules, 'organizations'] })
    const read = sharedSenderReader(async () => ({ ...store, table: members.table }), { organizations: true, verifiers: ['test-mail'] })
    expect((await read(boId)).map(({ id, provedAt }) => ({ id, proved: provedAt !== null }))).toEqual([{ id: billing, proved: true }])
    expect(await read(rootId)).toEqual([])
    expect(await read(rootId, billing)).toEqual([])
    expect(await read(anaId)).toEqual([])
    // Without organizations, every other sender of the app.
    const everyone = sharedSenderReader(async () => storeSqlOf(context), { organizations: false, verifiers: [] })
    expect((await everyone(rootId)).map(({ id }) => id)).toEqual([billing])
  })
})
