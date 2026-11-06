import { describe, expect, it, vi } from 'vitest'
import { ConnectionError, type WebhookTrigger } from '@protobase/workflows/plugin'
import type { JobContext } from '../../jobs/job-types'
import { connectionTexts } from '../connections/connection-texts'
import { recordedDb, type Recorded } from './recorded-db'
import { triggerJobs } from './trigger-jobs'

// A stopped trigger that subscribed, made through Ada's account.
const stopped = { type: 'acme:pushed', input: {}, workflow_id: null, version: 1, connection_id: 'acc-1', enabled_by: 'ada', store: { subscription: 'sub-1' }, subscribed: true }
const answer = ({ sql }: Recorded) => (sql.startsWith('select type') ? [stopped] : [])

const described = { label: 'Pushed', description: 'A trigger of the tests', input: { type: 'object' } }

// The stop job of an app where saves no longer take the webhook type, as after its connection's client was removed.
const stopJob = (webhook: WebhookTrigger, connect = vi.fn(() => ({ accessToken: async () => 'access-token-1' }))) => {
  const input = { schema: 'workflows', allowPrivateAddresses: false, polling: () => undefined, webhooks: () => undefined, redact: (text: string) => text, origin: () => undefined, systemPath: () => '/api', declared: () => undefined, readyTypes: [] }
  return triggerJobs(input as unknown as Parameters<typeof triggerJobs>[0], connectionTexts(undefined), { webhooks: (type) => (type === 'acme:pushed' ? webhook : undefined), connect }).stop
}

const run = async (job: ReturnType<typeof stopJob>) => {
  const { db, statements } = recordedDb(answer)
  await job.options.run({ trigger: 't1' }, { db, signal: new AbortController().signal } as unknown as JobContext)
  return statements
}

describe('the trigger stop job', () => {
  it('ends the subscription of a webhook type saves no longer take, then removes the trigger', async () => {
    const unsubscribe = vi.fn(async () => {})
    const statements = await run(stopJob({ ...described, kind: 'webhook', subscribe: async () => ({}), receive: async () => ({ items: [] }), unsubscribe }))
    expect(unsubscribe).toHaveBeenCalledWith(expect.objectContaining({ state: { subscription: 'sub-1' } }))
    expect(statements.some(({ sql }) => sql.startsWith('delete from'))).toBe(true)
  })

  it('keeps the trigger, as the record of the subscription, when its unsubscribe cannot sign in', async () => {
    const unsubscribe = vi.fn(async () => {
      throw new ConnectionError('not_connected', 'The account is no longer connected')
    })
    const statements = await run(stopJob({ ...described, kind: 'webhook', subscribe: async () => ({}), receive: async () => ({ items: [] }), unsubscribe }))
    expect(statements.some(({ sql }) => sql.startsWith('delete from'))).toBe(false)
    expect(statements.find(({ sql }) => sql.includes('last_error = $'))?.parameters.join(' ')).toContain('not_connected')
  })
})
