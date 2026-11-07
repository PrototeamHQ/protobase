import type { Db } from '@protobase/query'
import type { PollingTrigger, WebhookTrigger } from '@protobase/workflows/plugin'
import { defineJob } from '../../jobs/define-job'
import type { JobDefinition } from '../../jobs/job-types'
import { queueRuns } from '../start-workflow'
import { callPlugin, triggerCall, type TriggerContextInput } from './plugin-call'
import { itemCeiling, pollProblem, stateProblem } from './poll-result'
import { backoffPollAt, nextPollAt, pollEvery } from './poll-schedule'
import { claimTrigger, saveNeedsSignIn, savePluginFailure, savePoll, saveRenewal, setNextJob, type ClaimKey } from './trigger-claim'

/** A poll or renewal: of this trigger's generation, due at `due`. */
export type PollPayload = { trigger: string; generation: number; due: string }

export type PollJobsInput = TriggerContextInput & {
  schema: string
  polling: (type: string) => PollingTrigger | undefined
  webhooks: (type: string) => WebhookTrigger | undefined
  /** Blanks the workflows' secrets out of a plugin's error message. */
  redact: (text: string) => string
}

/** The plugin's most items a poll, as it declares them, never more than 100. */
export const pollLimit = (type: PollingTrigger) => Math.min(type.limit ?? itemCeiling, itemCeiling)

/** How often a webhook trigger renews its subscription at its provider. */
export const renewEvery = (type: WebhookTrigger) => type.renewEvery ?? '1 day'

/**
 * The jobs that poll a polling trigger and renew a webhook trigger's subscription at its provider, each on the trigger's
 * claim (`claimTrigger`): only the job the trigger names runs it, so a stale or duplicate job does nothing. The plugin's
 * error marks the trigger failing and backs off; an expired sign-in stops it, with every trigger on that connection,
 * until its owner signs in again; any other error is thrown, and the job retries under its own id.
 */
export const pollJobs = (input: PollJobsInput) => {
  const { schema, redact } = input

  // Queues the job's next run and names it on the trigger, in the transaction that holds the trigger's row.
  const queueNext = async (trx: Db, job: JobDefinition<PollPayload>, claim: ClaimKey, due: Date) => {
    const id = await job.enqueue(trx, { trigger: claim.trigger, generation: claim.generation, due: due.toISOString() }, { runAt: due })
    await setNextJob(trx, schema, claim.trigger, id)
  }

  const failed = (db: Db, job: JobDefinition<PollPayload>, claim: ClaimKey, message: string, nextAt: Date) =>
    db.transaction().execute(async (trx) => {
      if (await savePluginFailure(trx, schema, claim, message, nextAt)) await queueNext(trx, job, claim, nextAt)
    })

  const poll: JobDefinition<PollPayload> = defineJob<PollPayload>({
    name: 'workflows.poll',
    timeout: '5 minutes',
    retryDelay: '5 seconds',
    run: async ({ trigger, generation, due }, { db, job, signal }) => {
      const claim = { trigger, generation, job: job.id, attempt: job.attempt }
      const claimed = await claimTrigger(db, schema, claim)
      const type = claimed && input.polling(claimed.type)
      if (!claimed || !type) return
      // A dynamic `every` that throws fails the poll as the plugin's error, backing off as an interval of a minute would.
      const interval = await callPlugin(async () => pollEvery(type, claimed.input), redact)
      if (!('value' in interval)) return failed(db, poll, claim, 'expired' in interval ? interval.expired : interval.failed, backoffPollAt('1 minute', claimed.consecutive_failures + 1, new Date()))
      const every = interval.value
      const limit = pollLimit(type)
      const call = triggerCall(input, claimed, signal, redact)
      const outcome = await callPlugin(() => type.poll({ ...call.context, cursor: claimed.cursor, store: claimed.store, limit, due: new Date(due) }), call.redact)
      const now = new Date()
      if ('expired' in outcome) return saveNeedsSignIn(db, schema, claim, claimed, outcome.expired)
      const backoff = backoffPollAt(every, claimed.consecutive_failures + 1, now)
      if ('failed' in outcome) return failed(db, poll, claim, outcome.failed, backoff)
      const problem = pollProblem(outcome.value, limit)
      if (problem) return failed(db, poll, claim, `The poll ${problem}`, backoff)
      const { items, cursor, store } = outcome.value
      // The next time after the one this poll was due at, or after now when polls fell behind, so they do not pile up.
      const dueAt = new Date(due)
      const nextAt = nextPollAt(every, dueAt.getTime() > now.getTime() - 1_000 ? dueAt : now)
      await db.transaction().execute(async (trx) => {
        const runs = await savePoll(trx, schema, claim, items, { cursor, store: store === undefined ? claimed.store : store, nextAt })
        if (!runs) return
        await queueRuns(trx, runs)
        await queueNext(trx, poll, claim, nextAt)
      })
    },
  })

  const renew: JobDefinition<PollPayload> = defineJob<PollPayload>({
    name: 'workflows.renew',
    timeout: '5 minutes',
    retryDelay: '5 seconds',
    run: async ({ trigger, generation }, { db, job, signal }) => {
      const claim = { trigger, generation, job: job.id, attempt: job.attempt }
      const claimed = await claimTrigger(db, schema, claim)
      const type = claimed && input.webhooks(claimed.type)
      if (!claimed || !type?.renew) return
      const renewal = type.renew
      const call = triggerCall(input, claimed, signal, redact)
      const outcome = await callPlugin(() => renewal({ ...call.context, state: claimed.store }), call.redact)
      const now = new Date()
      if ('expired' in outcome) return saveNeedsSignIn(db, schema, claim, claimed, outcome.expired)
      // A renewal that failed is tried again well before the subscription it renews runs out.
      const backoff = backoffPollAt('1 minute', claimed.consecutive_failures + 1, now)
      if ('failed' in outcome) return failed(db, renew, claim, outcome.failed, backoff)
      const problem = stateProblem(outcome.value)
      if (problem) return failed(db, renew, claim, `The renewal ${problem}`, backoff)
      const nextAt = nextPollAt(renewEvery(type), now)
      await db.transaction().execute(async (trx) => {
        if (await saveRenewal(trx, schema, claim, { store: outcome.value, nextAt })) await queueNext(trx, renew, claim, nextAt)
      })
    },
  })

  return { poll, renew, jobs: [poll, renew] }
}

export type PollJobs = ReturnType<typeof pollJobs>
