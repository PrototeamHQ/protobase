import { sql, type Expression, type SqlBool } from 'kysely'
import { parentCondition, type Db, type ParentRead } from '@protobase/query'
import type { CheckedFilter, FieldModel } from '@protobase/schema'
import { storedValue } from './encryption/stored-value'
import { etagOf } from './etag'
import type { Entry } from './registry'
import { exposeRow, pickFields } from './rows'
import { type DeletedRows, filterCondition, keyConditions, returningList, scopeConditions, tableId, whereClause, columnId } from './sql-parts'
import type { Row, TenantValue } from './types'

export type StoredRecord = { record: Row; etag: string }

/** Which columns an operation reads or returns, and which of them the ETag hash covers. Default: every field. */
export type Shape = { fields?: FieldModel[]; etagFields?: string[] }

// The lookup fields a shape reads are exposed with the row's own fields.
const exposedModel = (entry: Entry, fields: FieldModel[] = []) => {
  const lookups = fields.filter((field) => field.lookup)
  return lookups.length === 0 ? entry.model : { ...entry.model, fields: { ...entry.model.fields, ...Object.fromEntries(lookups.map((field) => [field.name, field])) } }
}

const stored = async (entry: Entry, raw: Row | undefined, shape: Shape = {}): Promise<StoredRecord | undefined> => {
  if (!raw) return undefined
  const record = exposeRow(exposedModel(entry, shape.fields), raw)
  return { record, etag: await etagOf(entry, raw, shape.etagFields ? pickFields(record, shape.etagFields) : record) }
}

const rowsOf = async (db: Db, query: ReturnType<typeof sql>) => (await query.execute(db)).rows as Row[]

export type FetchOptions = Shape & {
  filter?: CheckedFilter
  /** The parents the caller must read for the row to be seen (`.parent(fk, 'read')`). */
  parents?: readonly ParentRead[]
  deleted?: DeletedRows
  /** `true` takes FOR UPDATE, for the row the write changes; `'no-key-update'` FOR NO KEY UPDATE, for a parent it checks. */
  lock?: boolean | 'no-key-update'
}

const lockClause = (lock: FetchOptions['lock']) => lock === 'no-key-update' ? sql` for no key update` : lock ? sql` for update` : sql``

/**
 * The row of the caller's tenant with this key (live unless `deleted` says otherwise), optionally narrowed by a filter
 * and the parents the caller reads.
 */
export const fetchRecord = async (db: Db, entry: Entry, key: readonly (string | number)[], tenant?: TenantValue, options: FetchOptions = {}) => {
  const { filter, parents = [], deleted, lock = false, ...shape } = options
  const conditions = [...scopeConditions(entry.model, tenant, deleted), ...keyConditions(entry.model, key), ...filterCondition(entry.model, filter), ...parents.map(parentCondition)]
  const query = sql`select ${returningList(entry, shape.fields)} from ${tableId(entry.model)} as t${whereClause(conditions)} limit 1${lockClause(lock)}`
  return stored(entry, (await rowsOf(db, query))[0], shape)
}

/** The key of a stored record, as `fetchRecords` names it: its primary key's values as text. */
export const recordKey = (entry: Entry, record: Row) => JSON.stringify(entry.model.primaryKey.map((name) => String(record[name])))

/** The rows of the caller's tenant with these keys, live unless `deleted` says otherwise, in one read, by `recordKey`. */
export const fetchRecords = async (db: Db, entry: Entry, keys: readonly (readonly (string | number)[])[], tenant?: TenantValue, options: Shape & Pick<FetchOptions, 'deleted'> = {}) => {
  const { deleted, ...shape } = options
  const found = new Map<string, StoredRecord>()
  if (keys.length === 0) return found
  const keyColumns = sql.join(entry.model.primaryKey.map((name) => columnId(entry.model.fields[name]!)))
  const tuples = sql.join(keys.map((key) => sql`(${sql.join(key.map((value) => sql`${value}`))})`))
  const conditions = [...scopeConditions(entry.model, tenant, deleted), sql<SqlBool>`(${keyColumns}) in (${tuples})`]
  for (const raw of await rowsOf(db, sql`select ${returningList(entry, shape.fields)} from ${tableId(entry.model)} as t${whereClause(conditions)}`)) {
    const record = (await stored(entry, raw, shape))!
    found.set(recordKey(entry, record.record), record)
  }
  return found
}

const insertBody = (entry: Entry, values: Row) => {
  const fields = Object.keys(values).map((name) => entry.model.fields[name]!)
  return fields.length === 0
    ? sql`default values`
    : sql`(${sql.join(fields.map(columnId))}) values (${sql.join(fields.map((field) => storedValue(field, values[field.name])))})`
}

export const insertRecord = async (db: Db, entry: Entry, values: Row, shape: Shape = {}) => {
  const query = sql`insert into ${tableId(entry.model)} ${insertBody(entry, values)} returning ${returningList(entry, shape.fields)}`
  return (await stored(entry, (await rowsOf(db, query))[0], shape))!
}

/** The setting `insertUnlessTaken` leaves the taken row's key in, as a JSON array of text, for the rest of the transaction. */
export const takenKeySetting = 'protobase.taken_key'

/**
 * Inserts the row unless another row already holds its values of the unique key `unique` (field names), and then gives
 * `undefined` and leaves that row's key in `takenKeySetting`, its parts as text. The conflict's `do update` never
 * updates: its condition only records the key and is false, so no update trigger fires; Postgres still locks the taken
 * row until the transaction ends, and asks for the update privilege. A violation of any other unique key raises 23505
 * as a plain insert does. `values` must name at least one field, the column the never-run update would set.
 */
export const insertUnlessTaken = async (db: Db, entry: Entry, values: Row, unique: readonly string[], shape: Shape = {}) => {
  const { model } = entry
  const first = Object.keys(values)[0]
  if (first === undefined) throw new Error(`A ${entry.name} record with no values given cannot open an existing one`)
  const set = columnId(model.fields[first]!)
  const target = sql.join(unique.map((name) => columnId(model.fields[name]!)))
  const key = sql.join(model.primaryKey.map((name) => sql`t.${columnId(model.fields[name]!)}::text`))
  const taken = sql`set_config(${takenKeySetting}, json_build_array(${key})::text, true)`
  const query = sql`insert into ${tableId(model)} as t ${insertBody(entry, values)} on conflict (${target}) do update set ${set} = t.${set} where ${taken} is null returning ${returningList(entry, shape.fields)}`
  return stored(entry, (await rowsOf(db, query))[0], shape)
}

// A version or updated_at column that the table maintains itself is bumped here too, so ETags change even without a trigger.
const etagBump = (entry: Entry): Expression<unknown>[] => {
  if (!entry.etag) return []
  const column = columnId(entry.etag.field)
  return [entry.etag.kind === 'version' ? sql`${column} = ${column} + 1` : sql`${column} = clock_timestamp()`]
}

export const updateRecord = async (db: Db, entry: Entry, key: readonly (string | number)[], tenant: TenantValue | undefined, values: Row, shape: Shape = {}) => {
  const assignments = [
    ...Object.entries(values).map(([name, value]) => {
      const field = entry.model.fields[name]!
      return sql`${columnId(field)} = ${storedValue(field, value)}`
    }),
    ...etagBump(entry),
  ]
  const conditions = [...scopeConditions(entry.model, tenant), ...keyConditions(entry.model, key)]
  const query = sql`update ${tableId(entry.model)} as t set ${sql.join(assignments)}${whereClause(conditions)} returning ${returningList(entry, shape.fields)}`
  return (await stored(entry, (await rowsOf(db, query))[0], shape))!
}

export const deleteRecord = async (db: Db, entry: Entry, key: readonly (string | number)[], tenant?: TenantValue, shape: Shape = {}) => {
  const { model } = entry
  const conditions = [...scopeConditions(model, tenant), ...keyConditions(model, key)]
  const softField = model.softDelete ? model.fields[model.softDelete] : undefined
  if (model.softDelete && !softField) throw new Error(`Soft delete field "${model.softDelete}" is not a field of "${model.name}"`)
  const query = softField
    ? sql`update ${tableId(model)} as t set ${columnId(softField)} = clock_timestamp()${whereClause(conditions)} returning ${returningList(entry, shape.fields)}`
    : sql`delete from ${tableId(model)} as t${whereClause(conditions)} returning ${returningList(entry, shape.fields)}`
  return (await stored(entry, (await rowsOf(db, query))[0], shape))!
}

/** Clears the soft delete column of a deleted row. */
export const restoreRecord = async (db: Db, entry: Entry, key: readonly (string | number)[], tenant?: TenantValue, shape: Shape = {}) => {
  const { model } = entry
  const softField = model.softDelete ? model.fields[model.softDelete] : undefined
  if (!softField) throw new Error(`Resource "${model.name}" has no soft delete field to clear`)
  const conditions = [...scopeConditions(model, tenant, 'only'), ...keyConditions(model, key)]
  const assignments = [sql`${columnId(softField)} = null`, ...etagBump(entry)]
  const query = sql`update ${tableId(model)} as t set ${sql.join(assignments)}${whereClause(conditions)} returning ${returningList(entry, shape.fields)}`
  return (await stored(entry, (await rowsOf(db, query))[0], shape))!
}
