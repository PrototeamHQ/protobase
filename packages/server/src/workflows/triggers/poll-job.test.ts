import { describe, expect, it } from 'vitest'
import type { PollingTrigger } from '@protobase/workflows/plugin'
import type { JobContext } from '../../jobs/job-types'
import { pollJobs } from './poll-job'
import { recordedDb, type Recorded } from './recorded-db'

const claimed = { id: 't1', workflow_id: 'w1', version: 1, tenant_id: null, type: 'acme:feed', input: {}, cursor: 1, store: null, connection_id: null, consecutive_failures: 0 }

const described = { label: 'Thing', description: 'A trigger of the tests', input: { type: 'object' } }

describe('workflows.poll', () => {
  it('records an `every` that throws as the plugin failing, without throwing for the job to retry', async () => {
    // The claim finds the trigger; the failure's update finds it held no more, so no next poll is queued.
    const { db, statements } = recordedDb(({ sql }) => (sql.includes('set poll_attempt = $') ? [claimed] : []))
    const polling: PollingTrigger = { ...described, kind: 'polling', every: () => { throw new Error('no such feed') }, start: async () => 1, poll: async () => ({ items: [], cursor: 1 }) }
    const { poll } = pollJobs({ schema: 'workflows', allowPrivateAddresses: false, polling: () => polling, webhooks: () => undefined, redact: (text) => text })
    const context = { db, job: { id: 'job-1', name: 'workflows.poll', attempt: 1, maxAttempts: 10, startedOn: new Date() }, signal: new AbortController().signal } as JobContext
    await poll.options.run({ trigger: 't1', generation: 1, due: new Date().toISOString() }, context)
    const failure = statements.find(({ sql }) => sql.includes("set status = 'failing'"))
    const error = failure?.parameters.find((value): value is string => typeof value === 'string' && value.startsWith('{'))
    expect(JSON.parse(error!)).toMatchObject({ code: 'plugin_error', message: 'no such feed' })
  })
})
