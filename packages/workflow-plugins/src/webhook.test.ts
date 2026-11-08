import { describe, expect, it } from 'vitest'
import { webhookTriggers } from './webhook'

describe('app:webhook', () => {
  it('starts one run with the call, keyed by its idempotency key when it has one', async () => {
    const receive = webhookTriggers.webhook!.receive
    const event = { method: 'POST', query: {}, headers: {}, body: { a: 1 }, received_at: '2026-11-05T05:00:00.000Z' }
    const request = new Request('http://localhost/', { method: 'POST' })
    expect(await receive({ request, event, idempotencyKey: 'msg_1', input: {} })).toEqual({ items: [{ key: 'msg_1', data: event }] })
    expect(await receive({ request, event, idempotencyKey: undefined, input: {} })).toEqual({ items: [{ data: event }] })
  })
})
