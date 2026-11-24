import { sql, type Kysely } from 'kysely'
import type { RecordModel } from './record-model'
import type { RecordState } from './record-state'
import { recordTable } from './record-table'

type Row = {
  newest: { name: string; protobase_version: string; model: RecordModel; model_hash: string } | null
  matched: boolean
  not_additive: string[]
  unfinished: RecordState['unfinished']
}

/**
 * The record as the startup decides on it, for the runtime's model hash `hash`: whether the table is there, then one
 * query for the newest row, whether a row records `hash`, the rows not marked additive since the newest such row, and
 * the unfinished rows.
 */
export const readRecordState = async (db: Kysely<any>, hash: string): Promise<RecordState> => {
  const [found] = (await sql<{ found: boolean }>`select to_regclass(${recordTable}) is not null as found`.execute(db)).rows
  if (!found?.found) return { newest: undefined, matched: false, notAdditiveSince: [], unfinished: [] }
  const table = sql.raw(recordTable)
  const [row] = (
    await sql<Row>`
      with matched as (select max(applied_at) as at from ${table} where model_hash = ${hash})
      select
        (select json_build_object('name', name, 'protobase_version', protobase_version, 'model', model, 'model_hash', model_hash) from ${table} order by applied_at desc limit 1) as newest,
        (select at is not null from matched) as matched,
        (select coalesce(json_agg(h.name order by h.applied_at), '[]') from ${table} h, matched where h.applied_at > matched.at and h.additive is not true) as not_additive,
        (select coalesce(json_agg(json_build_object('name', h.name, 'after', h.physical -> 'after') order by h.applied_at), '[]') from ${table} h where h.completed_at is null) as unfinished`.execute(db)
  ).rows
  const newest = row!.newest
  return {
    newest: newest ? { name: newest.name, version: newest.protobase_version, model: newest.model, hash: newest.model_hash } : undefined,
    matched: row!.matched,
    notAdditiveSince: row!.not_additive,
    unfinished: row!.unfinished,
  }
}

/** Whether the record has a row of the model hash `hash`: `false` without a record. */
export const recordHasModel = async (db: Kysely<any>, hash: string) => {
  const [found] = (await sql<{ found: boolean }>`select to_regclass(${recordTable}) is not null as found`.execute(db)).rows
  if (!found?.found) return false
  const [row] = (await sql<{ has: boolean }>`select exists (select from ${sql.raw(recordTable)} where model_hash = ${hash}) as has`.execute(db)).rows
  return row!.has
}
