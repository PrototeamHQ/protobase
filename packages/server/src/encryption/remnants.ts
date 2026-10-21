import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { FieldModel, ResourceModel } from '@protobase/schema'
import { quoteIdent } from '../changes/capture-sql'
import { captureOff } from './capture-off'

// History keeps `before`/`after` by field name; the outbox keeps `old`/`new` by column name. Both name the resource.
type Store = { table: string; old: string; new: string; key: (field: FieldModel) => string }

const history: Store = { table: 'history', old: 'before', new: 'after', key: (field) => field.name }
const outbox: Store = { table: 'outbox', old: 'old', new: 'new', key: (field) => field.column }

const batchSize = 500

const tableOf = (schema: string, store: Store) => `${quoteIdent(schema)}.${quoteIdent(store.table)}`

const exists = async (db: Db, schema: string, store: Store) => {
  const { rows } = await sql<{ found: boolean }>`select to_regclass(${tableOf(schema, store)}) is not null as found`.execute(db)
  return rows[0]!.found
}

const holding = (store: Store, model: ResourceModel, field: FieldModel) =>
  sql`"resource" = ${model.name} and (${sql.id(store.old)} ? ${store.key(field)}::text or ${sql.id(store.new)} ? ${store.key(field)}::text)`

const count = async (db: Db, schema: string, store: Store, model: ResourceModel, field: FieldModel) => {
  if (!(await exists(db, schema, store))) return 0
  const { rows } = await sql<{ count: string }>`select count(*)::text as count from ${sql.raw(tableOf(schema, store))} where ${holding(store, model, field)}`.execute(db)
  return Number(rows[0]!.count)
}

// Removes the field from the rows that hold it, 500 at a time, each batch in a transaction of its own that captures nothing.
const scrub = async (db: Db, schema: string, store: Store, model: ResourceModel, field: FieldModel) => {
  if (!(await exists(db, schema, store))) return 0
  const table = sql.raw(tableOf(schema, store))
  const key = sql`${store.key(field)}::text`
  let total = 0
  for (;;) {
    const scrubbed = await captureOff(db, schema, async (trx) => {
      const result = await sql`with batch as (select "id" from ${table} where ${holding(store, model, field)} limit ${sql.raw(String(batchSize))})
update ${table} as t set ${sql.id(store.old)} = t.${sql.id(store.old)} - ${key}, ${sql.id(store.new)} = t.${sql.id(store.new)} - ${key} from batch where t."id" = batch."id"`.execute(trx)
      return Number(result.numAffectedRows ?? 0n)
    })
    total += scrubbed
    if (scrubbed < batchSize) return total
  }
}

/** The history rows of `model` that still hold `field`, kept from before it was encrypted. */
export const historyRemnants = (db: Db, schema: string, model: ResourceModel, field: FieldModel) => count(db, schema, history, model, field)

/** Removes `field` from the history of `model`, returning how many rows held it. */
export const scrubHistory = (db: Db, schema: string, model: ResourceModel, field: FieldModel) => scrub(db, schema, history, model, field)

/** The changes of `model` not yet dispatched that still hold `field`'s column. */
export const outboxRemnants = (db: Db, schema: string, model: ResourceModel, field: FieldModel) => count(db, schema, outbox, model, field)

/** Removes `field`'s column from the changes of `model` not yet dispatched, returning how many rows held it. */
export const scrubOutbox = (db: Db, schema: string, model: ResourceModel, field: FieldModel) => scrub(db, schema, outbox, model, field)
