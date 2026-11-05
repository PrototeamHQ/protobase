import { sql } from 'kysely'
import { encodeKey } from '@protobase/schema/internal'
import type { KeyValue } from '@protobase/schema'
import type { Db } from '@protobase/query'
import type { ResourceChange } from '../../changes/resource-change'
import { defineJob } from '../../jobs/define-job'
import type { Row } from '../../types'
import { readyAt, readyWhen, resolveTimeTerms } from '../ready/ready-when'
import { orRefusal, readyContext, startIfReady, type ReadyInput } from '../ready/ready-start'
import { activeTriggers, currentTrigger, triggerFailed } from './trigger-row'
import { printFilter } from '@protobase/schema'

/** Records one enable pass reads per job. */
const passSize = 100

type StartPayload = { trigger: string; generation: number; page_token?: string }
type ReadyCheckPayload = { trigger: string; generation: number; key: Row }

/**
 * The jobs that run triggers on every server process, so turning a workflow on, changing or turning it off needs no
 * restart: `workflows.trigger-start` (for a ready trigger, one pass over the records that already match, 100 per job),
 * `workflows.trigger-stop` (removes a stopped trigger), and `workflows.ready-check` (starts a run of one record when it
 * is ready, at the time its time terms say). Each acts only on the generation it was queued for.
 */
export const triggerJobs = (input: ReadyInput) => {
  const { schema } = input

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

  const start = defineJob<StartPayload>({
    name: 'workflows.trigger-start',
    timeout: '5 minutes',
    run: async ({ trigger: id, generation, page_token }, { db }) => {
      const trigger = await currentTrigger(db, schema, id, generation)
      if (!trigger || !input.declared(trigger.type)) return
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

  const stop = defineJob<{ trigger: string }>({
    name: 'workflows.trigger-stop',
    run: async ({ trigger }, { db }) => {
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

  return { jobs: [start, stop, readyCheck], start, stop, onChanges }
}

export type TriggerJobs = ReturnType<typeof triggerJobs>
