import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { HttpProblem } from '../problem'
import { verifySignature, verifyStandardWebhook } from './verify-signature'

const post = (body: string, headers: Record<string, string>) => new Request('http://localhost/', { method: 'POST', body, headers })

const refusal = (promise: Promise<unknown>) => promise.then(() => undefined, (error: unknown) => (error instanceof HttpProblem ? [error.status, error.slug, error.detail] : error))

describe('verifySignature', () => {
  const body = '{"action":"opened"}'
  const github = (signature: string) => post(body, { 'x-hub-signature-256': signature })
  const options = { secret: 'It’s a Secret to Everybody', header: 'x-hub-signature-256', prefix: 'sha256=' }
  const valid = `sha256=${createHmac('sha256', options.secret).update(body).digest('hex')}`

  it('returns the body when its HMAC signature matches', async () => {
    expect(await verifySignature(github(valid), options)).toBe(body)
    const base64 = createHmac('sha256', 'shpss').update(body).digest('base64')
    expect(await verifySignature(post(body, { 'x-shopify-hmac-sha256': base64 }), { secret: 'shpss', header: 'x-shopify-hmac-sha256', encoding: 'base64' })).toBe(body)
  })

  it('refuses a missing, malformed or wrong signature with a 401 problem', async () => {
    expect(await refusal(verifySignature(post(body, {}), options))).toEqual([401, 'invalid-signature', 'The request has no x-hub-signature-256 signature'])
    expect(await refusal(verifySignature(github('sha256=zz'), options))).toEqual([401, 'invalid-signature', 'The x-hub-signature-256 signature does not match the body'])
    expect(await refusal(verifySignature(github(valid.replace(/.$/, (last) => (last === '0' ? '1' : '0'))), options))).toEqual([401, 'invalid-signature', expect.any(String)])
    expect(await refusal(verifySignature(post('{"action":"closed"}', { 'x-hub-signature-256': valid }), options))).toEqual([401, 'invalid-signature', expect.any(String)])
  })
})

describe('verifyStandardWebhook', () => {
  const key = Buffer.from('a secret of thirty-two bytes!!!!')
  const secret = `whsec_${key.toString('base64')}`
  const body = '{"type":"user.created"}'
  const now = () => 1_700_000_000_000
  const sign = (id: string, timestamp: number, content = body) => `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${content}`).digest('base64')}`
  const message = (signature: string, timestamp = 1_700_000_000) => post(body, { 'webhook-id': 'msg_1', 'webhook-timestamp': String(timestamp), 'webhook-signature': signature })

  it('returns the body when one of its signatures matches', async () => {
    expect(await verifyStandardWebhook(message(sign('msg_1', 1_700_000_000)), { secret, now })).toBe(body)
    expect(await verifyStandardWebhook(message(`v1,bm9wZQ== ${sign('msg_1', 1_700_000_000)}`), { secret, now })).toBe(body)
  })

  it('refuses missing headers, a stale timestamp and wrong signatures', async () => {
    expect(await refusal(verifyStandardWebhook(post(body, {}), { secret, now }))).toEqual([401, 'invalid-signature', expect.any(String)])
    expect(await refusal(verifyStandardWebhook(message(sign('msg_1', 1_699_999_000), 1_699_999_000), { secret, now }))).toEqual([401, 'invalid-signature', 'The webhook-timestamp is too old or too far ahead'])
    expect(await refusal(verifyStandardWebhook(message(sign('msg_2', 1_700_000_000)), { secret, now }))).toEqual([401, 'invalid-signature', 'No webhook-signature matches the body'])
    expect(await refusal(verifyStandardWebhook(message(sign('msg_1', 1_700_000_000, '{}')), { secret, now }))).toEqual([401, 'invalid-signature', expect.any(String)])
  })
})
