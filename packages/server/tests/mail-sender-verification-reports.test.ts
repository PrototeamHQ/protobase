import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mcpStores, type McpStores } from './support/mcp-app'
import { farAhead, servedWith, testVerifier } from './support/verifier-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

let stores: McpStores
beforeAll(async () => { stores = await mcpStores() })
afterAll(async () => { await stores.fixture.db.destroy() })
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const refusal = { code: 'VERIFICATION_REFUSED', message: 'This report is not accepted.' }
const verified = { state: 'verified', valid_until: farAhead.toISOString() }

// Ana's billing and sales addresses, each with a pending verification, and the secret each verify was given.
const pending = async () => {
  const { verifier, inputs } = testVerifier()
  const served = await servedWith(stores, [verifier, { ...testVerifier().verifier, id: 'other-mail' }])
  const billing = await served.add('billing@shop.example')
  const sales = await served.add('sales@shop.example')
  await served.verify(billing)
  await served.verify(sales)
  const [billingInput, salesInput] = inputs
  return { ...served, billing, sales, billingInput: billingInput!, salesInput: salesInput! }
}

// Each refused report answers the same status and the same bytes.
const expectRefused = async (response: Response) => {
  expect(response.status).toBe(403)
  expect(await response.text()).toBe(JSON.stringify(refusal))
}

describe('a report that settles a verification', () => {
  it('settles it with its own secret, once, and the address derives verified', async () => {
    const { report, billing, billingInput, stateOf, rows } = await pending()
    const settled = await report({ verifier: 'test-mail', secret: billingInput.secret, ...verified })
    expect(settled.status).toBe(200)
    expect(await settled.json()).toEqual({ settled: true })
    expect(await stateOf(billing)).toBe('verified')
    await expectRefused(await report({ verifier: 'test-mail', secret: billingInput.secret, ...verified }))
    await expectRefused(await report({ verifier: 'test-mail', secret: billingInput.secret, state: 'failed', error_code: 'from_rewritten' }))
    // Verified for at most 90 days from when it settled.
    expect((await rows(billing)).filter(({ state }) => state === 'verified')).toMatchObject([{ valid_days: 90 }])
  })

  it("is refused alike, changing nothing, without its own secret: none, a wrong one, another verification's, its id, its stored hash, or from another verifier", async () => {
    const { app, cookie, report, billing, sales, billingInput, salesInput, rows, stateOf } = await pending()
    const [stored] = await rows(billing)
    const attempts = [
      report({ verifier: 'test-mail', ...verified }),
      report({ verifier: 'test-mail', secret: 'A'.repeat(43), ...verified }),
      report({ verifier: 'test-mail', secret: billingInput.verification_id, ...verified }),
      report({ verifier: 'test-mail', secret: stored!.secret_hash, ...verified }),
      report({ verifier: 'other-mail', secret: billingInput.secret, ...verified }),
      report({ verifier: 'unknown', secret: billingInput.secret, ...verified }),
      report({ verifier: 'test-mail', ...verified }, `/api/auth/mail-sender-verifications/report?secret=${encodeURIComponent(billingInput.secret)}`),
      app.request('/api/auth/mail-sender-verifications/report', { cookie, body: { verifier: 'test-mail', ...verified } }),
    ]
    for (const attempt of attempts) await expectRefused(await attempt)
    // Sales' secret settles sales, never billing.
    expect((await report({ verifier: 'test-mail', secret: salesInput.secret, state: 'failed', error_code: 'from_rewritten' })).status).toBe(200)
    expect(await stateOf(billing)).toBe('unverified')
    expect((await rows(billing)).map(({ state }) => state)).toEqual(['pending', 'pending'])
    expect(await stateOf(sales)).toBe('unverified')
  })

  it('is refused once the verification expired, and the address stays unverified', async () => {
    const { app, report, billing, billingInput, stateOf } = await pending()
    await app.store.query(`update mail_sender_verification set expires_at = '2000-01-01' where sender_id = $1`, [billing])
    await expectRefused(await report({ verifier: 'test-mail', secret: billingInput.secret, ...verified }))
    expect(await stateOf(billing)).toBe('unverified')
  })

  it('counts a verified one no longer once its valid_until passed', async () => {
    const { app, report, billing, billingInput, stateOf } = await pending()
    await report({ verifier: 'test-mail', secret: billingInput.secret, ...verified })
    expect(await stateOf(billing)).toBe('verified')
    await app.store.query(`update mail_sender_verification set valid_until = '2000-01-01' where sender_id = $1`, [billing])
    expect(await stateOf(billing)).toBe('unverified')
  })

  it("keeps the verifier's error text as data, and refuses one too long or with control characters before looking anything up", async () => {
    const { report, list, sales, salesInput } = await pending()
    for (const error of ['a'.repeat(501), 'a\u0000b']) {
      const malformed = await report({ verifier: 'test-mail', secret: salesInput.secret, state: 'failed', error_code: 'from_rewritten', error })
      expect(malformed.status).toBe(400)
      expect(await malformed.text()).not.toContain(salesInput.secret)
    }
    const error = '<script>alert(1)</script>"><img src=x onerror=alert(2)>'
    expect((await report({ verifier: 'test-mail', secret: salesInput.secret, state: 'failed', error_code: 'from_rewritten', error })).status).toBe(200)
    const listed = (await list()).senders.find((sender) => sender.id === sales)!
    expect(listed.verifications).toContainEqual(expect.objectContaining({ verifier: 'test-mail', state: 'failed', errorCode: 'from_rewritten', error }))
  })

  it('shows no secret in the answer or any log when settling fails on the server', async () => {
    const { app, report, billingInput } = await pending()
    const logged = (['error', 'warn', 'log', 'info'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}))
    await app.store.query('alter table mail_sender_verification rename to mail_sender_verification_gone')
    const failed = await report({ verifier: 'test-mail', secret: billingInput.secret, ...verified })
    expect(failed.status).toBe(500)
    expect(await failed.text()).not.toContain(billingInput.secret)
    for (const spy of logged) for (const call of spy.mock.calls) expect(JSON.stringify(call, (_, value) => (value instanceof Error ? `${value.message} ${value.stack}` : value))).not.toContain(billingInput.secret)
    await app.store.query('alter table mail_sender_verification_gone rename to mail_sender_verification')
  })
})
