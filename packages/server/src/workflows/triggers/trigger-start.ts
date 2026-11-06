import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { hookMode } from '../hooks/hook-secrets'
import { hookPath } from '../hooks/hook-paths'
import { saveHook } from '../hooks/hook-store'
import { callPlugin, triggerContext, type PluginOutcome } from './plugin-call'
import { renewEvery, type PollJobs, type PollJobsInput } from './poll-job'
import { stateProblem } from './poll-result'
import { backoffPollAt, firstPollAt, nextPollAt, pollEvery } from './poll-schedule'
import { setNextJob } from './trigger-claim'
import type { TriggerRow } from './trigger-row'

export type TriggerStartInput = PollJobsInput & {
  /** The app's own origin and system path, which a subscribing webhook trigger's URL is made from; none without auth. */
  origin: () => string | undefined
  systemPath: () => string
}

type Started = Pick<TriggerRow, 'id' | 'generation' | 'version' | 'tenant_id' | 'workflow_id' | 'type' | 'input'>
type Restart = (db: Db, at: Date) => Promise<void>

// The trigger's cursor and store as they are now, while it runs on this generation, and whether each is set at all:
// a JSON null reads as null too.
const stateOf = async (db: Db, schema: string, { id, generation }: Started) =>
  (await sql<{ cursor: unknown; has_cursor: boolean; has_store: boolean; consecutive_failures: number }>`select cursor, cursor is not null as has_cursor, store is not null as has_store, consecutive_failures from ${sql.id(schema, 'triggers')}
    where id = ${id} and generation = ${generation} and status in ('active', 'failing')`.execute(db)).rows[0]

/**
 * Records a start the plugin refused: an expired sign-in waits for a new one; any other error marks the trigger failing
 * and tries the start again after the backoff.
 */
const startFailed = async (db: Db, schema: string, trigger: Started, outcome: Exclude<PluginOutcome<unknown>, { value: unknown }>, failures: number, restart: Restart) => {
  const expired = 'expired' in outcome
  const error = JSON.stringify({ code: expired ? 'link_expired' : 'plugin_error', message: expired ? outcome.expired : outcome.failed, at: new Date().toISOString() })
  const { rows } = await sql`update ${sql.id(schema, 'triggers')} set status = ${expired ? 'needs_sign_in' : 'failing'}, consecutive_failures = consecutive_failures + 1,
    last_error = ${error}::jsonb, updated_at = now() where id = ${trigger.id} and generation = ${trigger.generation} and status in ('active', 'failing') returning 1`.execute(db)
  if (rows.length > 0 && !expired) await restart(db, backoffPollAt('1 minute', failures + 1, new Date()))
}

// Saves the state a start gave, only while there is none and the trigger runs on this generation, and clears what an
// earlier failed start recorded; then queues its first poll or renewal and names that job on the trigger, all in one
// transaction.
const saveStart = (db: Db, schema: string, trigger: Started, column: 'cursor' | 'store', value: unknown, nextAt: Date | undefined, next: ((trx: Db) => Promise<string>) | undefined) =>
  db.transaction().execute(async (trx) => {
    const { rows } = await sql`update ${sql.id(schema, 'triggers')} set ${sql.ref(column)} = coalesce(${sql.ref(column)}, ${JSON.stringify(value ?? null)}::jsonb), status = 'active', consecutive_failures = 0, last_error = null, next_poll_at = ${nextAt ?? null}, updated_at = now()
      where id = ${trigger.id} and generation = ${trigger.generation} and status in ('active', 'failing') returning 1`.execute(trx)
    if (rows.length === 0 || !next) return
    await setNextJob(trx, schema, trigger.id, await next(trx))
  })

/**
 * Starts a polling or subscribing webhook trigger: the plugin's `start` or `subscribe` runs only for a trigger that has
 * no cursor or subscription yet, so a new version on the same input carries on where the last one was; then its first
 * poll or renewal is queued, whose new job id leaves any older one with nothing to do.
 */
export const triggerStarts = (input: TriggerStartInput, jobs: PollJobs) => {
  const { schema, redact } = input

  const startPolling = async (db: Db, trigger: Started, signal: AbortSignal, restart: Restart) => {
    const type = input.polling(trigger.type)
    const state = type && (await stateOf(db, schema, trigger))
    if (!type || !state) return
    // A dynamic `every` is the plugin's code too: what it throws is recorded like a refused start.
    const first = await callPlugin(async () => firstPollAt(pollEvery(type, trigger.input), new Date()), redact)
    if (!('value' in first)) return startFailed(db, schema, trigger, first, state.consecutive_failures, restart)
    const due = first.value
    let cursor = state.cursor
    if (!state.has_cursor) {
      const outcome = await callPlugin(() => type.start(triggerContext(input, trigger.input, signal)), redact)
      if (!('value' in outcome)) return startFailed(db, schema, trigger, outcome, state.consecutive_failures, restart)
      const problem = stateProblem(outcome.value)
      if (problem) return startFailed(db, schema, trigger, { failed: `The start ${problem}` }, state.consecutive_failures, restart)
      cursor = outcome.value
    }
    await saveStart(db, schema, trigger, 'cursor', cursor, due, (trx) => jobs.poll.enqueue(trx, { trigger: trigger.id, generation: trigger.generation, due: due.toISOString() }, { runAt: due }))
  }

  const startWebhook = async (db: Db, trigger: Started, signal: AbortSignal, restart: Restart) => {
    const type = input.webhooks(trigger.type)
    const state = type?.subscribe && (await stateOf(db, schema, trigger))
    const mode = hookMode(trigger.input)
    if (!type?.subscribe || !state || state.has_store) return
    const origin = input.origin()
    if (!origin || !mode) return startFailed(db, schema, trigger, { failed: origin ? 'The trigger names an auth mode the app does not know' : 'The app has no public address to subscribe with: give its auth a baseURL' }, state.consecutive_failures, restart)
    // The URL is made here and handed to the plugin alone: the app keeps only its key's SHA-256.
    const { key, secret } = await saveHook(db, schema, { workflow: trigger.workflow_id, tenant: trigger.tenant_id, mode })
    const subscribe = type.subscribe
    const outcome = await callPlugin(() => subscribe({ ...triggerContext(input, trigger.input, signal), url: `${origin}${hookPath(input.systemPath(), key)}`, secret }), redact)
    if (!('value' in outcome)) return startFailed(db, schema, trigger, outcome, state.consecutive_failures, restart)
    const problem = stateProblem(outcome.value)
    if (problem) return startFailed(db, schema, trigger, { failed: `The subscription ${problem}` }, state.consecutive_failures, restart)
    const renewal = type.renew && nextPollAt(renewEvery(type), new Date())
    await saveStart(db, schema, trigger, 'store', outcome.value, renewal, renewal && ((trx) => jobs.renew.enqueue(trx, { trigger: trigger.id, generation: trigger.generation, due: renewal.toISOString() }, { runAt: renewal })))
  }

  return { startPolling, startWebhook }
}
