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
      cronJobs: [],
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

  it("schedules pg_cron's jobs again as they were, named or not, an inactive one inactive", () => {
    const job = { id: 1, schedule: '*/5 * * * *', database: 'postgres', local: true }
    const script = replayScript({
      secrets: [],
      queues: [],
      cronJobs: [
        { ...job, name: 'purge', command: "delete from public.todos where status = 'done'", active: true },
        { ...job, id: 2, name: null, command: 'select 1', active: true },
        { ...job, id: 3, name: 'paused', command: "select net.http_post('https://example.com')", active: false },
      ],
    })
    expect(script.split('\n')).toEqual([
      "SELECT cron.schedule('purge', '*/5 * * * *', 'delete from public.todos where status = ''done''');",
      "SELECT cron.schedule('*/5 * * * *', 'select 1');",
      "SELECT cron.alter_job(cron.schedule('paused', '*/5 * * * *', 'select net.http_post(''https://example.com'')'), active => false);",
      '',
    ])
  })

  it('is empty when there is nothing to make', () => {
    expect(replayScript({ secrets: [], queues: [], cronJobs: [] })).toBe('')
  })
})
