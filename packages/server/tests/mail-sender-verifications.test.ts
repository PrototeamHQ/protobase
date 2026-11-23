import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mcpStores, type McpStores } from './support/mcp-app'
import { farAhead, servedWith, testVerifier } from './support/verifier-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

let stores: McpStores
beforeAll(async () => { stores = await mcpStores() })
afterAll(async () => { await stores.fixture.db.destroy() })
afterEach(() => vi.unstubAllGlobals())

describe('verifying a From address', () => {
  it("sends one test message through the person's Gmail From the address, and keeps the verification pending with no secret in sight", async () => {
    const { verifier, inputs } = testVerifier()
    const { sent, add, verify, list, rows } = await servedWith(stores, [verifier])
    const billing = await add('billing@shop.example')

    const response = await verify(billing)
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(JSON.parse(body)).toEqual({ verifications: [{ verifier: 'test-mail', state: 'pending', expiresAt: expect.any(String) }] })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatch(/^From: billing@shop\.example$/m)
    expect(sent[0]).toMatch(/^To: check-1@verify\.example$/m)

    const [{ secret, verification_id }] = inputs as [(typeof inputs)[0]]
    expect(Buffer.from(secret, 'base64url')).toHaveLength(32)
    expect(secret).not.toContain(verification_id)
    const listed = await list()
    expect(listed.verifiers).toBe(true)
    expect(listed.senders.find((sender) => sender.id === billing)).toMatchObject({ state: 'unverified', verifications: [{ verifier: 'test-mail', state: 'pending' }] })
    for (const text of [body, JSON.stringify(listed)]) {
      expect(text).not.toContain(secret)
      expect(text).not.toContain(verification_id)
    }
    // The store keeps the secret's hash alone.
    const [row] = await rows(billing)
    expect(row!.secret_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(row)).not.toContain(secret)
  })

  it('sends no second test while one is pending, and supersedes one whose time ran out, as when verify never returned', async () => {
    const { verifier, inputs } = testVerifier()
    const { app, sent, add, verify, rows } = await servedWith(stores, [verifier])
    const billing = await add('billing@shop.example')
    await verify(billing)
    expect((await verify(billing)).status).toBe(200)
    expect(sent).toHaveLength(1)
    expect(inputs).toHaveLength(1)

    await app.store.query(`update mail_sender_verification set expires_at = '2000-01-01' where sender_id = $1`, [billing])
    await verify(billing)
    expect(sent).toHaveLength(2)
    expect((await rows(billing)).map(({ state, error_code }) => ({ state, error_code }))).toEqual([
      { state: 'failed', error_code: 'verification_expired' },
      { state: 'pending', error_code: null },
    ])
  })

  it('stays pending at most 24 hours from its start, whatever the verifier asks', async () => {
    const { add, verify, rows } = await servedWith(stores, [testVerifier().verifier])
    const billing = await add('billing@shop.example')
    await verify(billing)
    expect(await rows(billing)).toMatchObject([{ state: 'pending', pending_hours: 24 }])
  })

  it('fails as verifier_error when verify answers pending without expires_at, or throws, and the address stays unverified', async () => {
    const vague = testVerifier(async () => ({ state: 'pending' }))
    const { add, verify, rows, stateOf } = await servedWith(stores, [vague.verifier])
    const billing = await add('billing@shop.example')
    await verify(billing)
    expect(await rows(billing)).toMatchObject([{ state: 'failed', error_code: 'verifier_error' }])
    expect(await stateOf(billing)).toBe('unverified')

    const broken = testVerifier(async () => Promise.reject(new Error('The verifier service is down')))
    const other = await servedWith(stores, [broken.verifier])
    const sales = await other.add('sales@shop.example')
    expect((await other.verify(sales)).status).toBe(500)
    expect(await other.rows(sales)).toMatchObject([{ state: 'failed', error_code: 'verifier_error' }])
    expect(await other.stateOf(sales)).toBe('unverified')
  })

  it("is refused to staff signed in as the person, and to anyone for another's address, with nothing sent", async () => {
    const { verifier, inputs } = testVerifier()
    const { app, cookie, sent, add, verify } = await servedWith(stores, [verifier])
    const billing = await add('billing@shop.example')
    const bo = await app.signIn('bo@example.com')
    expect((await verify(billing, bo)).status).toBe(404)

    await app.store.query(`update session set impersonated_by = 'alex@operator.example' where user_id = $1`, [await app.userId('ana@example.com')])
    const staff = await verify(billing, cookie)
    expect(staff.status).toBe(403)
    expect(await staff.json()).toMatchObject({ code: 'STAFF_CANNOT_CHANGE_SIGN_IN' })
    expect(inputs).toEqual([])
    expect(sent).toEqual([])
  })
})

describe('the sweep', () => {
  it("records each due verification's check, and expires one whose verifier has no check", async () => {
    const checked = testVerifier(undefined, async ({ address }) => (address === 'billing@shop.example' ? { state: 'verified', valid_until: farAhead } : { state: 'pending' }))
    const pushOnly = { ...testVerifier().verifier, id: 'push-only' }
    const { app, add, verify, stateOf } = await servedWith(stores, [checked.verifier, pushOnly])
    const billing = await add('billing@shop.example')
    const sales = await add('sales@shop.example')
    await verify(billing)
    await verify(sales)
    await app.store.query(`update mail_sender_verification set next_check_at = '2000-01-01' where verifier = 'test-mail'`)
    await app.store.query(`update mail_sender_verification set expires_at = '2000-01-01' where verifier = 'push-only' and sender_id = $1`, [sales])

    const [sweep] = app.auth.senderVerificationJobs
    await sweep!.options.run(undefined as never, {} as never)
    const byVerifier = async (id: string) => (await app.store.query<{ verifier: string; state: string; error_code: string | null }>('select verifier, state, error_code from mail_sender_verification where sender_id = $1 order by verifier', [id])).rows
    expect(await byVerifier(billing)).toEqual([
      { verifier: 'push-only', state: 'pending', error_code: null },
      { verifier: 'test-mail', state: 'verified', error_code: null },
    ])
    expect(await stateOf(billing)).toBe('verified')
    expect(await byVerifier(sales)).toEqual([
      { verifier: 'push-only', state: 'failed', error_code: 'verification_expired' },
      { verifier: 'test-mail', state: 'pending', error_code: null },
    ])
    expect(await stateOf(sales)).toBe('unverified')
  })
})
