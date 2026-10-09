import { sql } from 'kysely'
import type { FieldModel, ResourceModel } from '@protobase/schema'
import type { ColumnStats } from './anchor-positions'
import type { Db } from './db'
import { QueryError } from './errors'
import { toNumber } from './numbers'

type StatsRow = {
  null_frac: unknown
  bounds: string[] | null
  common_vals: string[] | null
  common_freqs: unknown[] | null
}

/** Reads pg_stats for one column; values are cast to text[] so any column type parses uniformly. */
export const readColumnStats = async (db: Db, model: ResourceModel, field: FieldModel): Promise<ColumnStats> => {
  const result = await sql<StatsRow>`
    select null_frac::float8 as null_frac,
      histogram_bounds::text::text[] as bounds,
      most_common_vals::text::text[] as common_vals,
      most_common_freqs::float8[] as common_freqs
    from pg_stats
    where schemaname = coalesce(${model.table.schema ?? null}::text, current_schema())
      and tablename = ${model.table.name} and attname = ${field.column}
    order by inherited
    limit 1
  `.execute(db)
  const row = result.rows[0]
  if (!row?.bounds || row.bounds.length < 2) {
    throw new QueryError('no_statistics', `No histogram for "${field.name}"; run ANALYZE or sort by a higher-cardinality column`)
  }
  return {
    nullFraction: toNumber(row.null_frac),
    bounds: row.bounds,
    commonValues: row.common_vals ?? [],
    commonFrequencies: (row.common_freqs ?? []).map(toNumber),
  }
}
