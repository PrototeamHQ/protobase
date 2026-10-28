import { sql, type Expression } from 'kysely'
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

const stored = async (entry: Entry, raw: Row | undefined, shape: Shape = {}): Promise<StoredRecord | undefined> => {
  if (!raw) return undefined
  const record = exposeRow(entry.model, raw)
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

export const insertRecord = async (db: Db, entry: Entry, values: Row, shape: Shape = {}) => {
  const fields = Object.keys(values).map((name) => entry.model.fields[name]!)
  const body = fields.length === 0
    ? sql`default values`
    : sql`(${sql.join(fields.map(columnId))}) values (${sql.join(fields.map((field) => storedValue(field, values[field.name])))})`
  const query = sql`insert into ${tableId(entry.model)} ${body} returning ${returningList(entry, shape.fields)}`
  return (await stored(entry, (await rowsOf(db, query))[0], shape))!
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
