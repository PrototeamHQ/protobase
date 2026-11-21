import { sql, type RawBuilder } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { baseQuery } from './base-query'
import type { Db } from './db'
import { toNumber } from './numbers'
import type { Scope } from './scope'

/** One grouping of the rows: by the value of `key`, keeping only the `limit` most frequent values when `ranked`. */
export type CountSet = { key: RawBuilder<unknown>; ranked: boolean }
export type GroupCount = { value: unknown; count: number }

/**
 * How many sets one statement counts. Each set costs about a fifth of reading the row: on 260k rows of 1.7 KB, reading
 * takes about 100 ms and each set adds about 24 ms. Four keep a statement under twice the cost of one facet's, so it
 * fits the statement timeout wherever one facet does.
 */
export const setsPerScan = 4

/**
 * Counts the rows per value of every set's key, the filter and scope applying to each, in one scan of the table
 * (`GROUPING SETS`) per `setsPerScan` sets. A ranked set keeps its `limit` most frequent values, ties by value, as
 * `facetCounts` orders them; the others keep every value. Returns each set's values in that order, a null key included.
 */
export const groupedCounts = async (db: Db, model: ResourceModel, filter: CheckedFilter | undefined, scope: Scope | undefined, sets: CountSet[], limit: number): Promise<GroupCount[][]> => {
  const counts: GroupCount[][] = []
  for (let start = 0; start < sets.length; start += setsPerScan) {
    counts.push(...(await countScan(db, model, filter, scope, sets.slice(start, start + setsPerScan), limit)))
  }
  return counts
}

const countScan = async (db: Db, model: ResourceModel, filter: CheckedFilter | undefined, scope: Scope | undefined, sets: CountSet[], limit: number) => {
  const keys = sets.map((_, index) => sql.id(`k${index}`))
  // `offset 0` keeps the keys a subquery of their own, whose groups Postgres does not count from the columns they are made
  // of: from those it would expect a bucket or a day per row, and sort to disk what it can hash in a few kilobytes
  const keyed = baseQuery(db, model, filter, scope).select(sets.map(({ key }, index) => key.as(`k${index}`))).offset(0)
  // A row of set i is the one whose grouping leaves out every key but k_i
  const setOf = sql`case ${sql.join(keys.map((key, index) => sql`when grouping(${key}) = 0 then ${sql.lit(index)}`), sql` `)} end`
  const ranked = sets.flatMap(({ ranked }, index) => (ranked ? [sql.lit(index)] : []))
  const kept = ranked.length === 0 ? sql`true` : sql`s not in (${sql.join(ranked)}) or rank <= ${limit}`
  const result = await sql<Record<string, unknown> & { s: number; n: string }>`
    with g as (
      select ${setOf} as s, ${sql.join(keys)}, count(*) as n
      from (${keyed}) as v
      group by grouping sets (${sql.join(keys.map((key) => sql`(${key})`))})
    ), r as (
      select g.*, row_number() over (partition by s order by n desc, ${sql.join(keys)}) as rank from g
    )
    select s, ${sql.join(keys)}, n::text as n from r
    where ${kept}
    order by s, rank
  `.execute(db)
  const counts = sets.map((): GroupCount[] => [])
  for (const row of result.rows) counts[row.s]!.push({ value: row[`k${row.s}`], count: toNumber(row.n) })
  return counts
}
