import { describe, expect, it } from 'vitest'
import { verifyStandardWebhook } from '../functions/verify-signature'
import { newWebhookSecret, standardWebhookHeaders } from './standard-webhooks'

describe('standardWebhookHeaders', () => {
  // The example of the Standard Webhooks specification and its reference libraries.
  it('signs the specification example as it does', async () => {
    const headers = await standardWebhookHeaders('msg_p5jXN8AQM9LWM0D4loKWxJek', 1614265330, '{"test": 2432232314}', 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw')
    expect(headers).toEqual({
      'webhook-id': 'msg_p5jXN8AQM9LWM0D4loKWxJek',
      'webhook-timestamp': '1614265330',
      'webhook-signature': 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
    })
  })

  it('makes requests that verifyStandardWebhook accepts, and none without a secret', async () => {
    const secret = newWebhookSecret()
    const body = '{"type":"orders.created"}'
    const headers = await standardWebhookHeaders('evt_1_created', 1791666245, body, secret)
    const request = new Request('http://receiver.test', { method: 'POST', headers, body })
    expect(await verifyStandardWebhook(request, { secret, now: () => 1791666245_000 })).toBe(body)
    expect(await standardWebhookHeaders('evt_1_created', 1, body)).toEqual({ 'webhook-id': 'evt_1_created', 'webhook-timestamp': '1' })
    await expect(standardWebhookHeaders('evt', 1, body, 'not base64!')).rejects.toThrow('A webhook secret is `whsec_` and base64')
  })
})
