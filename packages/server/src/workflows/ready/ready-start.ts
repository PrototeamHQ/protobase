import { createHash } from 'node:crypto'
import { checkFilter, evaluateFilter, parseFilter, type KeyValue, type ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import type { Db } from '@protobase/query'
import { StepError } from '@protobase/workflows'
import type { ReadyTrigger } from '@protobase/workflows/plugin'
import { assistantRecords } from '../../assistant/records'
import type { Deps } from '../../deps'
import { HttpProblem } from '../../problem'
import type { Row } from '../../types'
import { saverSession, type SaverRoles } from '../plugin-records'
import { startWorkflow } from '../start-workflow'
import { triggerFailed, type TriggerRow } from '../triggers/trigger-row'

/** The most characters of a run's key; a longer ready key is kept as its SHA-256. */
const keyLength = 200

export type ReadyInput = { deps: () => Deps; schema: string; roles: SaverRoles; declared: (type: string) => ReadyTrigger | undefined; readyTypes: Iterable<string> }

/** The record key and the values of the `key` fields: the key a record starts one run under. */
export const readyKey = (model: ResourceModel, record: Row, keyFields: readonly string[] = []) => {
  const key = `record:${encodeKey(model.primaryKey.map((name) => record[name] as KeyValue))}${keyFields.map((name) => `:${JSON.stringify(record[name] ?? null)}`).join('')}`
  return key.length <= keyLength ? key : `record:sha256:${createHash('sha256').update(key).digest('hex')}`
}

// Whether `when` holds for the record as it was read, evaluated now; a field the reader may not see is missing, so a
// term on it does not hold.
const holds = (model: ResourceModel, when: string | undefined, record: Row) => {
  if (when === undefined) return true
  const parsed = parseFilter(when)
  const checked = parsed.ast && checkFilter(model, parsed.ast)
  if (!checked) return true
  if (!checked.ok) return false
  return Boolean(evaluateFilter(checked.filter, record))
}

/** What a ready trigger works on: its declaration, resource, and the records API as the user who saved its version. */
export const readyContext = async ({ deps, roles, declared }: ReadyInput, trigger: Omit<TriggerRow, 'generation'>) => {
  const ready = declared(trigger.type)
  const spec = ready?.ready(trigger.input)
  const model = spec && deps().registry.find(spec.resource)?.model
  if (!spec || !model) return
  const session = await saverSession(roles, trigger.saved_by, trigger.tenant_id ?? undefined)
  return { spec, model, records: assistantRecords(deps(), session) }
}

/**
 * Starts a run of the record if it is ready now: one read of it through the API as the user who saved the enabled
 * version, so their access rules, tenant scope and field access decide what the run sees, `when` evaluated on what they
 * read, then one keyed insert, so a record starts once per ready key. A record that is gone, or that they may not read,
 * starts nothing; a saver who holds no role any more marks the trigger failing.
 */
export const startIfReady = async (input: ReadyInput, db: Db, trigger: TriggerRow, key: Row) => {
  try {
    const context = await readyContext(input, trigger)
    if (!context) return
    const { spec, model, records } = context
    const keyValues = model.primaryKey.map((name) => key[name] as KeyValue)
    const read = await records.get(spec.resource, keyValues.length === 1 ? keyValues[0]! : keyValues).catch((error: unknown) => {
      if (error instanceof HttpProblem && error.status === 404) return
      throw error
    })
    if (!read) return
    const { etag: _, permissions: __, ...record } = read.record as Row
    if (!holds(model, spec.when, record)) return
    await startWorkflow(db, {
      workflow: trigger.workflow_id,
      version: trigger.version,
      input: { resource: spec.resource, key: encodeKey(model.primaryKey.map((name) => record[name] as KeyValue)), record },
      ...(trigger.tenant_id !== null && { tenant: trigger.tenant_id }),
      startedBy: `trigger:${trigger.id}`,
      key: readyKey(model, record, spec.key),
      schema: input.schema,
    })
  } catch (error) {
    if (error instanceof HttpProblem) return triggerFailed(db, input.schema, trigger.id, trigger.generation, 'refused', `${error.status} ${error.title}`)
    // The saver holds no role any more, or is gone: nothing they enabled may read records.
    if (error instanceof StepError) return triggerFailed(db, input.schema, trigger.id, trigger.generation, 'refused', error.reason)
    throw error
  }
}
