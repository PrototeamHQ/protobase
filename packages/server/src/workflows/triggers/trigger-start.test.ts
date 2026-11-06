import { describe, expect, it, vi } from 'vitest'
import type { PollingTrigger, WebhookTrigger } from '@protobase/workflows/plugin'
import type { PollJobs } from './poll-job'
import { recordedDb, type Recorded } from './recorded-db'
import { triggerStarts } from './trigger-start'

const trigger = { id: 't1', generation: 1, version: 1, tenant_id: null, workflow_id: 'w1', type: 'acme:thing', input: {} }
const fresh = { cursor: null, has_cursor: false, has_store: false, consecutive_failures: 0 }

// A trigger with no state yet, whose updates each find its row.
const answer = ({ sql }: Recorded) => (sql.startsWith('select cursor') ? [fresh] : sql.startsWith('update') ? [{ '?column?': 1 }] : [])

const jobs = () => ({ poll: { enqueue: vi.fn(async () => 'job-1') }, renew: { enqueue: vi.fn(async () => 'job-2') } })

const starts = (types: { polling?: PollingTrigger; webhook?: WebhookTrigger }, queued = jobs()) =>
  triggerStarts(
    {
      schema: 'workflows',
      allowPrivateAddresses: false,
      polling: () => types.polling,
      webhooks: () => types.webhook,
      redact: (text) => text,
      origin: () => 'https://app.test',
      systemPath: () => '/api',
    },
    queued as unknown as PollJobs,
  )

// The error the trigger's failure recorded, from its update's parameters.
const recordedError = (statements: Recorded[]) => {
  const failure = statements.find(({ sql }) => sql.includes('last_error = $'))
  const error = failure?.parameters.find((value) => typeof value === 'string' && value.startsWith('{'))
  return error === undefined ? undefined : (JSON.parse(String(error)) as { code: string; message: string })
}

const described = { label: 'Thing', description: 'A trigger of the tests', input: { type: 'object' } }

describe('triggerStarts', () => {
  it('records an `every` that throws as the trigger failing, with its error, and queues no poll', async () => {
    const { db, statements } = recordedDb(answer)
    const queued = jobs()
    const restart = vi.fn(async () => {})
    const polling: PollingTrigger = { ...described, kind: 'polling', every: () => { throw new Error('no such feed') }, start: async () => 1, poll: async () => ({ items: [], cursor: 1 }) }
    await starts({ polling }, queued).startPolling(db, trigger, new AbortController().signal, restart)
    expect(recordedError(statements)).toMatchObject({ code: 'plugin_error', message: 'no such feed' })
    expect(statements.find(({ sql }) => sql.includes('last_error = $'))?.parameters).toContain('failing')
    expect(queued.poll.enqueue).not.toHaveBeenCalled()
    expect(restart).toHaveBeenCalledOnce()
  })

  it('clears the status, failures and error an earlier failed start left once a start works', async () => {
    const { db, statements } = recordedDb(answer)
    const webhook: WebhookTrigger = { ...described, kind: 'webhook', subscribe: async () => ({ id: 'sub-1' }), receive: async () => ({ items: [] }) }
    await starts({ webhook }).startWebhook(db, trigger, new AbortController().signal, async () => {})
    const saved = statements.find(({ sql }) => sql.includes('"store" = coalesce'))
    expect(saved?.sql).toContain("status = 'active', consecutive_failures = 0, last_error = null")
  })

  it('renews a kept subscription at once for a trigger that resumes, subscribing no second time', async () => {
    const { db, statements } = recordedDb(({ sql }) => (sql.startsWith('select cursor') ? [{ ...fresh, has_store: true }] : sql.startsWith('update') ? [{ '?column?': 1 }] : []))
    const queued = jobs()
    const subscribe = vi.fn(async () => ({ id: 'sub-2' }))
    const webhook: WebhookTrigger = { ...described, kind: 'webhook', subscribe, renew: async () => ({ id: 'sub-1' }), receive: async () => ({ items: [] }) }
    await starts({ webhook }, queued).startWebhook(db, trigger, new AbortController().signal, async () => {})
    expect(subscribe).not.toHaveBeenCalled()
    expect(queued.renew.enqueue).toHaveBeenCalledOnce()
    expect(statements.some(({ sql }) => sql.startsWith('insert into "workflows"."hooks"'))).toBe(false)
  })

  it('keeps the URL key and secret out of the error a failed subscribe records', async () => {
    const { db, statements } = recordedDb(answer)
    const webhook: WebhookTrigger = {
      ...described,
      kind: 'webhook',
      subscribe: async ({ url, secret }: { url: string; secret: string }) => {
        throw new Error(`The service refused ${url} (${encodeURIComponent(url)}) with ${secret}, ${secret.slice('whsec_'.length)}`)
      },
      receive: async () => ({ items: [] }),
    }
    await starts({ webhook }).startWebhook(db, trigger, new AbortController().signal, async () => {})
    const insert = statements.find(({ sql }) => sql.startsWith('insert into "workflows"."hooks"'))!
    const message = recordedError(statements)!.message
    expect(message).toContain('https://app.test/api/workflows/hooks/[redacted]')
    expect(message).not.toMatch(/whsec_[A-Za-z0-9+/]/)
    // The insert keeps the secret in clear for a standard_webhooks hook; none of what it holds is in the message.
    const secret = String(insert.parameters[2])
    expect(secret.startsWith('whsec_')).toBe(true)
    expect(message).not.toContain(secret.slice('whsec_'.length))
    expect(message).not.toContain(encodeURIComponent(secret.slice('whsec_'.length)))
  })
})
