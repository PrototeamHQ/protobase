import { describe, expect, it } from 'vitest'
import { replayScript } from './replay'

describe('replayScript', () => {
  it("makes Vault's secrets and pgmq's queues again through their own functions", () => {
    const script = replayScript({
      secrets: [
        { name: 'stripe_key', description: "Stripe's key", secret: "sk_'1" },
        { name: null, description: '', secret: 'x' },
      ],
      queues: [
        { name: 'emails', unlogged: false, partitioned: false, messages: [{ message: '{"to": "a@example.com"}', headers: null, visibleAt: '2026-10-20 12:00:00+00' }] },
        { name: 'events', unlogged: true, partitioned: false, messages: [] },
      ],
    })
    expect(script.split('\n')).toEqual([
      "SELECT vault.create_secret('sk_''1', 'stripe_key', 'Stripe''s key');",
      "SELECT vault.create_secret('x', NULL, '');",
      "SELECT pgmq.create('emails');",
      `SELECT pgmq.send('emails', '{"to": "a@example.com"}'::jsonb, NULL::jsonb, '2026-10-20 12:00:00+00'::timestamptz);`,
      "SELECT pgmq.create_unlogged('events');",
      '',
    ])
  })

  it('is empty when there is nothing to make', () => {
    expect(replayScript({ secrets: [], queues: [] })).toBe('')
  })
})
