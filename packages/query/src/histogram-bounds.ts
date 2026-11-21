import { sql } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { baseQuery } from './base-query'
import type { Db } from './db'
import { toNumber } from './numbers'
import type { Scope } from './scope'

/** A column's filtered minimum and maximum, null without a value, and how many rows have one. */
export type Bounds = { min: number | null; max: number | null; count: number }

/** The bounds of every column in one scan of the table, in the order given. */
export const histogramBounds = async (db: Db, model: ResourceModel, filter: CheckedFilter | undefined, scope: Scope | undefined, columns: unknown[]): Promise<Bounds[]> => {
  if (columns.length === 0) return []
  const row = await baseQuery(db, model, filter, scope)
    .select(columns.flatMap((column, index) => [
      sql`min(${column})::float8::text`.as(`lo${index}`),
      sql`max(${column})::float8::text`.as(`hi${index}`),
      sql`count(${column})::text`.as(`n${index}`),
    ]))
    .executeTakeFirstOrThrow() as Record<string, string | null>
  return columns.map((_, index) => {
    const lo = row[`lo${index}`] ?? null
    const hi = row[`hi${index}`] ?? null
    return { min: lo === null ? null : Number(lo), max: hi === null ? null : Number(hi), count: toNumber(row[`n${index}`]) }
  })
}
