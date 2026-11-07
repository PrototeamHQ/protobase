import { createHash } from 'node:crypto'
import { sql } from 'kysely'
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
import { triggerFailed, triggerRecovered, type TriggerRow } from '../triggers/trigger-row'

/** The most characters of a run's key; a longer ready key is kept as its SHA-256. */
const keyLength = 200

export type ReadyInput = { deps: () => Deps; schema: string; roles: SaverRoles; declared: (type: string) => ReadyTrigger | undefined; readyTypes: Iterable<string> }

/**
 * The resource, the record key and the values of the `key` fields: the key a record starts one run under, so a trigger
 * moved to another resource starts its records afresh.
 */
export const readyKey = (resource: string, model: ResourceModel, record: Row, keyFields: readonly string[] = []) => {
  const key = `record:${JSON.stringify(resource)}:${encodeKey(model.primaryKey.map((name) => record[name] as KeyValue))}${keyFields.map((name) => `:${JSON.stringify(record[name] ?? null)}`).join('')}`
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

/**
 * Why a trigger may not go on reading as its saver: they hold no role any more or are gone, or the API refuses them
 * (401, 403); `undefined` for any other error, such as a busy database, which the job retries.
 */
export const refusal = (error: unknown) => {
  if (error instanceof StepError) return error.reason
  if (error instanceof HttpProblem && (error.status === 401 || error.status === 403)) return `${error.status} ${error.title}`
  return
}

/** The work's value, or the refusal that stopped it; any other error is thrown on. */
export const orRefusal = <T>(work: Promise<T>): Promise<{ value: T } | { refused: string }> =>
  work.then(
    (value) => ({ value }),
    (error: unknown) => {
      const reason = refusal(error)
      if (reason === undefined) throw error
      return { refused: reason }
    },
  )

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
 * starts nothing; a refused saver, or a key field they cannot read, marks the trigger failing, and a failing trigger
 * that reads a record is active again. Answers whether this check brought the trigger back, so its records are passed
 * over again for what it missed.
 */
export const startIfReady = async (input: ReadyInput, db: Db, trigger: TriggerRow, key: Row) => {
  const failed = (message: string) => triggerFailed(db, input.schema, trigger, 'refused', message).then(() => false)
  const found = await orRefusal(readyContext(input, trigger))
  if ('refused' in found) return failed(found.refused)
  const context = found.value
  if (!context) return false
  const { spec, model, records } = context
  const keyValues = model.primaryKey.map((name) => key[name] as KeyValue)
  const got = await orRefusal(records.get(spec.resource, keyValues.length === 1 ? keyValues[0]! : keyValues).catch((error: unknown) => {
    if (error instanceof HttpProblem && error.status === 404) return
    throw error
  }))
  if ('refused' in got) return failed(got.refused)
  const read = got.value
  if (!read) return false
  const { etag: _, permissions: __, ...record } = read.record as Row
  const hidden = (spec.key ?? []).find((name) => !(name in record))
  if (hidden) return failed(`the key field ${hidden} is not readable by the user who saved the workflow`)
  const recovered = trigger.status === 'failing' && (await triggerRecovered(db, input.schema, trigger))
  if (!holds(model, spec.when, record)) return recovered
  await db.transaction().execute(async (trx) => {
    // Holds the workflow against turning it off until the run is in, so no run starts once it is off or moved on.
    const { rows } = await sql<{ enabled_version: number | null }>`select enabled_version from ${sql.id(input.schema, 'workflows')} where id = ${trigger.workflow_id} for share`.execute(trx)
    if (rows[0]?.enabled_version !== trigger.version) return
    await startWorkflow(trx, {
      workflow: trigger.workflow_id,
      version: trigger.version,
      input: { resource: spec.resource, key: encodeKey(model.primaryKey.map((name) => record[name] as KeyValue)), record },
      ...(trigger.tenant_id !== null && { tenant: trigger.tenant_id }),
      startedBy: `trigger:${trigger.id}`,
      key: readyKey(spec.resource, model, record, spec.key),
      schema: input.schema,
    })
  })
  return recovered
}
