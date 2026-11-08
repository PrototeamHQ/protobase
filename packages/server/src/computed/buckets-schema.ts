import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { tableSql } from '../changes/capture-sql'
import { bucketModels, bucketsPlan, type BucketsState, type FoundBuckets } from './buckets-plan'
import { bucketsFunctionName } from './buckets-sql'
import { rollupsSchema } from './rollup-sql'

const rowsOf = async <R>(db: Db, query: ReturnType<typeof sql<R>>) => (await query.execute(db)).rows

// Only reads the catalogue.
const readRollup = async (db: Db, model: ResourceModel, from: ResourceModel): Promise<FoundBuckets> => {
  const [source] = await rowsOf(
    db,
    sql<{ oid: string; sql: string }>`select c.oid::text as oid, format('%I.%I', n.nspname, c.relname) as sql from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.oid = to_regclass(${tableSql(from)})`,
  )
  const columns = source
    ? await rowsOf(db, sql<{ name: string; type: string }>`select attname as name, format_type(atttypid, atttypmod) as type from pg_attribute where attrelid = ${source.oid}::oid and attnum > 0 and not attisdropped`)
    : []
  const [table] = await rowsOf(
    db,
    sql<{ schema: string; comment: string | null }>`select n.nspname as schema, obj_description(c.oid, 'pg_class') as comment from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.oid = to_regclass(${tableSql(model)})`,
  )
  const [fn] = await rowsOf(
    db,
    sql<{ source: string }>`select p.prosrc as source from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = ${rollupsSchema} and p.proname = ${bucketsFunctionName({ model })} and p.pronargs = 1 and p.proargtypes[0] = 'timestamptz'::regtype`,
  )
  return {
    from: source ? { sql: source.sql, types: Object.fromEntries(columns.map((column) => [column.name, column.type])) } : null,
    table: table ?? null,
    functionSource: fn?.source ?? null,
  }
}

const readBucketsState = async (db: Db, models: readonly ResourceModel[]): Promise<BucketsState> => {
  const [current] = await rowsOf(db, sql<{ schema: string }>`select current_schema() as schema`)
  const rollups: BucketsState['rollups'] = {}
  for (const { model, from } of bucketModels(models)) rollups[model.name] = await readRollup(db, model, from)
  return { schema: current!.schema, rollups }
}

/** Whether a resource is a time rollup. */
export const hasBuckets = (model: ResourceModel) => model.buckets !== undefined

/** The statements that bring the database to the resources' time rollups, and the rollups that are behind. */
export const bucketsMigrationPlan = async (db: Db, models: readonly ResourceModel[]) =>
  models.some(hasBuckets) ? bucketsPlan(models, await readBucketsState(db, models)) : { statements: [], behind: [] }
