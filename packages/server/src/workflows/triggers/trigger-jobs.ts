import { sql } from 'kysely'
import { encodeKey } from '@protobase/schema/internal'
import type { KeyValue } from '@protobase/schema'
import type { Db } from '@protobase/query'
import type { ResourceChange } from '../../changes/resource-change'
import { defineJob } from '../../jobs/define-job'
import type { Row } from '../../types'
import { readyAt, readyWhen, resolveTimeTerms } from '../ready/ready-when'
import { orRefusal, readyContext, startIfReady, type ReadyInput } from '../ready/ready-start'
import { activeTriggers, currentTrigger, triggerFailed, type TriggerRow } from './trigger-row'
import { printFilter } from '@protobase/schema'
import { callPlugin, triggerContext } from './plugin-call'
import { pollJobs } from './poll-job'
import { triggerStarts, type TriggerStartInput } from './trigger-start'

/** Records one enable pass reads per job. */
const passSize = 100

type StartPayload = { trigger: string; generation: number; page_token?: string }
type ReadyCheckPayload = { trigger: string; generation: number; key: Row }

/**
 * The jobs that run triggers on every server process, so turning a workflow on, changing or turning it off needs no
 * restart: `workflows.trigger-start` (for a ready trigger, one pass over the records that already match, 100 per job;
 * for a polling one its first poll; for a subscribing webhook one its subscription), `workflows.trigger-stop`
 * (unsubscribes a stopped webhook trigger at its provider and removes it), `workflows.ready-check` (starts a run of one
 * record when it is ready, at the time its time terms say), and the poll and renewal jobs. Each acts only on the
 * generation it was queued for.
 */
export const triggerJobs = (input: ReadyInput & TriggerStartInput) => {
  const { schema } = input
  const polls = pollJobs(input)

  const readyCheck = defineJob<ReadyCheckPayload>({
    name: 'workflows.ready-check',
    timeout: '5 minutes',
    run: async ({ trigger: id, generation, key }, { db }) => {
      const trigger = await currentTrigger(db, schema, id, generation)
      if (!trigger) return
      // A trigger that works again passes over its records once more, for those it missed while failing.
      if (await startIfReady(input, db, trigger, key)) await start.enqueue(db, { trigger: id, generation })
    },
  })

  // Queues the check of one record at the time it becomes ready; a record without a time it needs starts nothing.
  const queueCheck = async (db: Db, trigger: { id: string; generation: number }, primaryKey: readonly string[], timeTerms: Parameters<typeof readyAt>[0], record: Row) => {
    const at = readyAt(timeTerms, record, new Date())
    if (!at) return
    const key = Object.fromEntries(primaryKey.map((name) => [name, record[name]]))
    const recordKey = encodeKey(primaryKey.map((name) => record[name] as KeyValue))
    await readyCheck.enqueue(db, { trigger: trigger.id, generation: trigger.generation, key }, { runAt: at, key: `ready:${trigger.id}:${trigger.generation}:${recordKey}:${at.toISOString()}` })
  }

  const starts = triggerStarts(input, polls)

  const start: ReturnType<typeof defineJob<StartPayload>> = defineJob<StartPayload>({
    name: 'workflows.trigger-start',
    timeout: '5 minutes',
    run: async ({ trigger: id, generation, page_token }, { db, signal }) => {
      const trigger = await currentTrigger(db, schema, id, generation)
      if (!trigger) return
      const restart = async (later: Db, at: Date) => void (await start.enqueue(later, { trigger: id, generation }, { runAt: at }))
      if (input.polling(trigger.type)) return starts.startPolling(db, trigger, signal, restart)
      if (input.webhooks(trigger.type)) return starts.startWebhook(db, trigger, signal, restart)
      if (!input.declared(trigger.type)) return
      const found = await orRefusal(readyContext(input, trigger))
      if ('refused' in found) return triggerFailed(db, schema, trigger, 'refused', found.refused)
      if (!found.value) return
      const { spec, model, records } = found.value
      const split = readyWhen(spec.when)
      if (!split.ok) return
      const filter = split.when.filter && printFilter(split.when.filter)
      const listed = await orRefusal(records.list(spec.resource, { ...(filter && { filter }), page_size: passSize, ...(page_token && { page_token }) }))
      if ('refused' in listed) return triggerFailed(db, schema, trigger, 'refused', listed.refused)
      const page = listed.value
      const timeTerms = resolveTimeTerms(model, split.when.timeTerms)
      for (const record of page.items) await queueCheck(db, trigger, model.primaryKey, timeTerms, record)
      if (page.next_page_token) await start.enqueue(db, { trigger: id, generation, page_token: page.next_page_token })
    },
  })

  // A stopped webhook trigger's subscription is ended at its provider first; a sign-in that expired leaves nothing to end.
  const unsubscribe = async (db: Db, trigger: string, signal: AbortSignal) => {
    const { rows } = await sql<Pick<TriggerRow, 'type' | 'input'> & { store: unknown; subscribed: boolean }>`select type, input, store, store is not null as subscribed
      from ${sql.id(schema, 'triggers')} where id = ${trigger} and status = 'stopping'`.execute(db)
    const row = rows[0]
    const type = row?.subscribed ? input.webhooks(row.type) : undefined
    if (!row || !type?.unsubscribe) return
    const end = type.unsubscribe
    const outcome = await callPlugin(() => end({ ...triggerContext(input, row.input, signal), state: row.store }), input.redact)
    // The job tries again, as for any error, until the provider ends the subscription.
    if ('failed' in outcome) throw new Error(`The trigger's unsubscribe failed: ${outcome.failed}`)
  }

  const stop = defineJob<{ trigger: string }>({
    name: 'workflows.trigger-stop',
    timeout: '5 minutes',
    run: async ({ trigger }, { db, signal }) => {
      await unsubscribe(db, trigger, signal)
      await sql`delete from ${sql.id(schema, 'triggers')} where id = ${trigger} and status = 'stopping'`.execute(db)
    },
  })

  /**
   * Routes each dispatched change to the ready triggers on its resource and tenant: it queues the check of the record at
   * the time it becomes ready, in the dispatch's transaction. No sweep runs: a record becomes ready by a write, or at a
   * time a write set.
   */
  const onChanges = async (db: Db, changes: readonly ResourceChange[]) => {
    const types = [...input.readyTypes]
    if (types.length === 0) return
    const triggers = await activeTriggers(db, schema, types)
    for (const trigger of triggers) {
      const spec = input.declared(trigger.type)?.ready(trigger.input)
      const model = spec && input.deps().registry.find(spec.resource)?.model
      const split = spec && readyWhen(spec.when)
      if (!spec || !model || !split?.ok) continue
      const timeTerms = resolveTimeTerms(model, split.when.timeTerms)
      for (const change of changes) {
        if (change.resource !== spec.resource || !change.after) continue
        if (String(change.tenant ?? '') !== String(trigger.tenant_id ?? '')) continue
        await queueCheck(db, trigger, model.primaryKey, timeTerms, change.after)
      }
    }
  }

  return { jobs: [start, stop, readyCheck, ...polls.jobs], start, stop, onChanges }
}

export type TriggerJobs = ReturnType<typeof triggerJobs>
