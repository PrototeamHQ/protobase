import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { KeyValue } from '@protobase/schema'
import { decodeKey } from '@protobase/schema/internal'
import type { Entry } from '../registry'

const keyValues = (entry: Entry, key: string) => {
  const decoded = decodeKey(key, entry.keyTypes)
  return (Array.isArray(decoded) ? decoded : [decoded]) as KeyValue[]
}

const keyColumns = (entry: Entry) => entry.model.primaryKey.map((name) => entry.model.fields[name]!.column)

const table = (entry: Entry) => (entry.model.table.schema ? sql.id(entry.model.table.schema, entry.model.table.name) : sql.id(entry.model.table.name))

// A JSON field takes the value as JSON text; any other the value itself.
const columnValue = (entry: Entry, field: string, value: unknown) => (entry.model.fields[field]!.type === 'json' && value !== null ? JSON.stringify(value) : value)

const keyMatch = (entry: Entry, key: string) => {
  const values = keyValues(entry, key)
  return sql.join(keyColumns(entry).map((column, index) => sql`${sql.id(column)} = ${values[index]}`), sql` and `)
}

/** Whether the record of `key` is in its table. */
export const recordExists = async (db: Db, entry: Entry, key: string) => (await sql`select 1 from ${table(entry)} where ${keyMatch(entry, key)}`.execute(db)).rows.length > 0

/**
 * Writes a derived value into the field of the record of `key`, only when it differs, so an unchanged value is no
 * write: no change is captured, no event raised and no page refreshed.
 */
export const writeField = async (db: Db, entry: Entry, field: string, key: string, value: unknown) => {
  const column = sql.id(entry.model.fields[field]!.column)
  const written = columnValue(entry, field, value)
  await sql`update ${table(entry)} set ${column} = ${written} where ${keyMatch(entry, key)} and ${column} is distinct from ${written}`.execute(db)
}

/**
 * Writes a derived value into the field of another resource's record of the same key, adding the record when it has
 * none, and only when the value differs.
 */
export const writeSideField = async (db: Db, entry: Entry, field: string, key: string, value: unknown) => {
  const column = sql.id(entry.model.fields[field]!.column)
  const columns = keyColumns(entry)
  const written = columnValue(entry, field, value)
  await sql`insert into ${table(entry)} (${sql.join([...columns.map((name) => sql.id(name)), column])}) values (${sql.join([...keyValues(entry, key), written])})
    on conflict (${sql.join(columns.map((name) => sql.id(name)))}) do update set ${column} = excluded.${column} where ${table(entry)}.${column} is distinct from excluded.${column}`.execute(db)
}
