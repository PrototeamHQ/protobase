import { sql, type RawBuilder } from 'kysely'
import type { Db } from '@protobase/query'
import { whereSql } from './filter-sql'
import type { Preferences } from './parse-prefer'
import type { RestQuery } from './parse-query'
import { orderSql, rangeSql, selectSql } from './shape-sql'

/** Where rows come from: a table or a function call in FROM, and the name its rows go by, which fields are qualified with. */
export type RowSource = { from: RawBuilder<unknown>; alias: string; scalar?: boolean }

/** A page of rows as PostgREST's JSON array, as Postgres writes it; how many it holds; and how many match, when counted. */
export type RowsPage = { body: string; page: number; total?: number }

/** The most rows a read returns, as Supabase's `db-max-rows` default. */
export const maxRows = 1000

const plannedRows = async (trx: Db, source: RowSource, query: RestQuery) => {
  const { rows } = await sql<{ 'QUERY PLAN': [{ Plan: { 'Plan Rows': number } }] }>`explain (format json) select 1 from ${source.from}${whereSql(source.alias, query.filters)}`.execute(trx)
  return rows[0]!['QUERY PLAN'][0].Plan['Plan Rows']
}

/**
 * Reads the rows of `source` the query asks for: filtered, shaped by `select`, sorted, in its range and never more than
 * `maxRows`, as one JSON array built by Postgres, so values reach the client exactly as Postgres writes them. `count`
 * counts the matching rows: `exact` by counting, `planned` by the planner's estimate, `estimated` by counting up to
 * `maxRows` and estimating beyond.
 */
export const readRows = async (trx: Db, source: RowSource, query: RestQuery, count?: Preferences['count']): Promise<RowsPage> => {
  const where = whereSql(source.alias, query.filters)
  const range = { offset: query.range.offset, limit: Math.min(query.range.limit ?? maxRows, maxRows) }
  const columns = source.scalar ? sql`${sql.id(source.alias)} as pgrst_scalar` : selectSql(source.alias, query.select)
  const rows = sql`select ${columns} from ${source.from}${where}${orderSql(source.alias, query.order)}${rangeSql(range)}`
  const counted = count === 'exact' || count === 'estimated' ? sql`(select count(*) from ${source.from}${where})` : sql`null::bigint`
  const aggregate = source.scalar ? sql`json_agg(pgrst_rows.pgrst_scalar)` : sql`json_agg(pgrst_rows)`
  const { rows: [result] } = await sql<{ body: string; page: string; total: string | null }>`
    select coalesce(${aggregate}, '[]')::text as body, count(*) as page, ${counted} as total from (${rows}) as pgrst_rows
  `.execute(trx)
  const exact = result!.total === null ? undefined : Number(result!.total)
  const total = count === 'planned' || (count === 'estimated' && exact! > maxRows) ? await plannedRows(trx, source, query) : exact
  return { body: result!.body, page: Number(result!.page), ...(total !== undefined && { total }) }
}
