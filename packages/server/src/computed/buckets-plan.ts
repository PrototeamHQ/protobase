import type { ResourceModel } from '@protobase/schema'
import { quoteIdent } from '../changes/capture-sql'
import { bucketsComment, bucketsCommentPrefix, bucketsBody, bucketsFunctionSql, bucketsFillSql, createBucketsSql, dropBucketsTableSql, sumType, type BucketsTarget } from './buckets-sql'
import { rollupsSchema } from './rollup-sql'

/** What the database has of one time rollup: its source's table and column types, its own table, and its function. */
export type FoundBuckets = {
  /** The source's table as the catalogue qualifies it, with its columns' types as `format_type` names them; `null` when it does not exist. */
  from: { sql: string; types: Record<string, string> } | null
  /** The schema of the rollup's table, and its comment; `null` when it does not exist. */
  table: { schema: string; comment: string | null } | null
  /** The source of its refresh function; `null` when there is none. */
  functionSource: string | null
}

/** What the database has of the time rollups: the schema a new table without one goes in, and each rollup by resource name. */
export type BucketsState = { schema: string; rollups: Record<string, FoundBuckets> }

/** The time rollups of the resources, with the resources they roll up. */
export const bucketModels = (models: readonly ResourceModel[]) =>
  models.flatMap((model) => {
    if (!model.buckets) return []
    const from = models.find((candidate) => candidate.name === model.buckets!.from)
    if (!from) throw new Error(`Resource "${model.name}" is a time rollup of "${model.buckets.from}", which is not a resource`)
    return [{ model, from }]
  })

/** A time rollup with its tables and column types; fails on a source column the catalogue does not have. */
export const bucketsTarget = (model: ResourceModel, from: ResourceModel, found: FoundBuckets, table: string): BucketsTarget => {
  if (!found.from) throw new Error(`The table of resource "${from.name}", which "${model.name}" rolls up, does not exist`)
  const { types } = found.from
  const sourceColumn = (field: string) => {
    const column = from.fields[field]!.column
    if (!types[column]) throw new Error(`Table ${found.from!.sql} has no column ${quoteIdent(column)} for field "${from.name}.${field}"`)
    return column
  }
  const { time, every, by, measures } = model.buckets!
  const timeColumn = sourceColumn(time)
  return {
    model,
    table,
    fromTable: found.from.sql,
    every,
    time: { column: timeColumn, zoned: types[timeColumn] === 'timestamp with time zone' },
    by: by.map((field) => ({ column: model.fields[field]!.column, from: sourceColumn(field), type: types[sourceColumn(field)]! })),
    measures: Object.entries(measures).flatMap(([field, fns]) =>
      fns.map((fn) => {
        const column = sourceColumn(field)
        return { fn, column: model.fields[`${field}_${fn}`]!.column, from: column, type: fn === 'sum' ? sumType(types[column]!) : types[column]! }
      }),
    ),
    ...(from.softDelete && { softDelete: sourceColumn(from.softDelete) }),
  }
}

/** What brings the database to the time rollups: the statements, and the rollups they bring up to date. */
export type BucketsPlan = { statements: string[]; behind: string[] }

// A changed rollup's table is created again, as its rows are the source's, recomputed by the fill.
const targetStatements = (target: BucketsTarget, found: FoundBuckets) => {
  if (!found.table) return createBucketsSql(target)
  if (!found.table.comment?.startsWith(bucketsCommentPrefix)) throw new Error(`Table ${target.table} of time rollup "${target.model.name}" is a table of the project's own; drop or rename it in a migration, or name another table`)
  if (found.table.comment !== bucketsComment(target)) return [`-- The time rollup "${target.model.name}" changed: its table is created again and filled\n${dropBucketsTableSql(target)}`, ...createBucketsSql(target)]
  if (found.functionSource !== bucketsBody(target)) return [bucketsFunctionSql(target), bucketsFillSql(target)]
  return []
}

/**
 * Compares the database with the resources' time rollups. A missing table is created, with its indexes, function and
 * values; a changed one is dropped and created again; a changed function is written again and refills the rollup. A
 * table of the project's own where a rollup is declared fails. The table and function of a rollup the config no longer
 * has stay: a migration of the project's own drops them, a deploy after the one that stops reading them.
 */
export const bucketsPlan = (models: readonly ResourceModel[], state: BucketsState): BucketsPlan => {
  const behind: string[] = []
  const statements: string[] = []
  for (const { model, from } of bucketModels(models)) {
    const found = state.rollups[model.name]!
    // Always qualified and quoted alike, as the function names it and the table's comment holds it.
    const table = `${quoteIdent(model.table.schema ?? found.table?.schema ?? state.schema)}.${quoteIdent(model.table.name)}`
    const target = bucketsTarget(model, from, found, table)
    const sql = targetStatements(target, found)
    if (sql.length === 0) continue
    behind.push(model.name)
    statements.push(...sql)
  }
  return { statements: statements.length > 0 ? [`create schema if not exists ${quoteIdent(rollupsSchema)}`, ...statements] : [], behind }
}
