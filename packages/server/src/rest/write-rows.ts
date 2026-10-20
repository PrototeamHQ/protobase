import { sql, type RawBuilder } from 'kysely'
import type { Db } from '@protobase/query'
import type { ShapeItem } from './embed-shape'
import { joinsSql } from './embed-sql'
import { whereSql } from './filter-sql'
import type { Filter } from './parse-filter'
import type { Preferences } from './parse-prefer'
import { selectSql } from './shape-sql'

/** The table written: its qualified name, and the name its rows go by, which fields are qualified with. */
export type WriteTarget = { table: RawBuilder<unknown>; alias: string }

/**
 * What a write did: the rows it returns as a JSON array when `select` asks for them, how many rows it wrote, and of an
 * upsert how many it inserted rather than updated.
 */
export type Written = { body?: string; total: number; inserted?: number }

/** The rows a write returns, when asked for: `select` of them, its embeds resolved. */
export type Returning = { shape: ShapeItem[] } | undefined

// Returning the row asks for SELECT rights, under RLS too, so a write that returns nothing returns `1` alone, as
// PostgREST does: an insert-only policy then admits it. An upsert returns whether each row was new, as `xmax = 0`.
const returningSql = (target: WriteTarget, returning: Returning, upsert: boolean) => {
  const row = returning ? sql`${sql.id(target.alias)} as pgrst_row` : sql`1 as pgrst_one`
  return upsert ? sql` returning ${row}, (${sql.id(target.alias)}.xmax = 0) as pgrst_inserted` : sql` returning ${row}`
}

// The JSON body is one parameter, `pgrst_payload.body`, however many rows and columns read it.
const run = async (trx: Db, target: WriteTarget, payload: unknown, write: RawBuilder<unknown>, returning: Returning, upsert: boolean): Promise<Written> => {
  const inserted = upsert ? sql`(select count(*) from pgrst_source where pgrst_inserted)` : sql`null::bigint`
  const body = returning
    ? sql`(select coalesce(json_agg(pgrst_rows), '[]')::text from (select ${selectSql(target.alias, returning.shape)} from (select (pgrst_source.pgrst_row).* from pgrst_source) as ${sql.id(target.alias)}${joinsSql(target.alias, returning.shape)}) as pgrst_rows)`
    : sql`null::text`
  const { rows: [result] } = await sql<{ total: string; inserted: string | null; body: string | null }>`
    with pgrst_payload as (select ${JSON.stringify(payload ?? null)}::json as body), pgrst_source as (${write}${returningSql(target, returning, upsert)})
    select (select count(*) from pgrst_source) as total, ${inserted} as inserted, ${body} as body
  `.execute(trx)
  return { total: Number(result!.total), ...(result!.inserted !== null && { inserted: Number(result!.inserted) }), ...(result!.body !== null && { body: result!.body }) }
}

/** What an insert writes: the rows, the columns written, and how a row already there is resolved. */
export type Insert = {
  rows: Record<string, unknown>[]
  columns: string[]
  /** Columns a row leaves out take their default, rather than null (`Prefer: missing=default`). */
  defaults: boolean
  resolution?: Preferences['resolution']
  /** The columns of the conflict an upsert resolves. */
  conflict: string[]
}

// Each row's values read from the JSON body as a record of the table's type, so Postgres converts them as it reads
// JSON into the table; with `defaults`, a column a row leaves out is DEFAULT, row by row.
const valuesSql = (target: WriteTarget, insert: Insert) => {
  const columns = sql.join(insert.columns.map((column) => sql.id(column)))
  if (!insert.defaults) return sql`(${columns}) select ${sql.join(insert.columns.map((column) => sql`pgrst_body.${sql.id(column)}`))} from pgrst_payload, json_populate_recordset(null::${target.table}, pgrst_payload.body) as pgrst_body`
  const rows = insert.rows.map((row, i) =>
    sql`(${sql.join(insert.columns.map((column) => (Object.hasOwn(row, column) ? sql`(json_populate_record(null::${target.table}, (select body -> ${sql.raw(String(i))} from pgrst_payload))).${sql.id(column)}` : sql`default`)))})`,
  )
  return sql`(${columns}) values ${sql.join(rows)}`
}

const conflictSql = (insert: Insert) => {
  if (!insert.resolution) return sql``
  const target = sql.join(insert.conflict.map((column) => sql.id(column)))
  if (insert.resolution === 'ignore-duplicates') return sql` on conflict (${target}) do nothing`
  return sql` on conflict (${target}) do update set ${sql.join(insert.columns.map((column) => sql`${sql.id(column)} = excluded.${sql.id(column)}`))}`
}

/** Inserts the rows, or upserts them with a resolution, in one statement. */
export const insertRows = (trx: Db, target: WriteTarget, insert: Insert, returning: Returning) => {
  const values = insert.columns.length === 0 ? sql` default values` : sql` ${valuesSql(target, insert)}`
  const write = sql`insert into ${target.table} as ${sql.id(target.alias)}${values}${conflictSql(insert)}`
  return run(trx, target, insert.rows, write, returning, insert.resolution !== undefined)
}

/** Sets the columns of the body on every row the filters keep. */
export const updateRows = (trx: Db, target: WriteTarget, values: Record<string, unknown>, filters: readonly Filter[], returning: Returning) => {
  const set = sql.join(Object.keys(values).map((column) => sql`${sql.id(column)} = pgrst_body.${sql.id(column)}`))
  const from = sql`json_populate_record(null::${target.table}, (select body from pgrst_payload)) as pgrst_body`
  return run(trx, target, values, sql`update ${target.table} as ${sql.id(target.alias)} set ${set} from ${from}${whereSql(target.alias, filters)}`, returning, false)
}

/** Deletes every row the filters keep. */
export const deleteRows = (trx: Db, target: WriteTarget, filters: readonly Filter[], returning: Returning) =>
  run(trx, target, null, sql`delete from ${target.table} as ${sql.id(target.alias)}${whereSql(target.alias, filters)}`, returning, false)
