import { sql, type Kysely } from 'kysely'
import type { RecordModel } from './record-model'
import type { RecordState } from './record-state'
import { recordTable } from './record-table'

type Row = {
  newest: { name: string; protobase_version: string; model: RecordModel } | null
  matched: boolean
  not_additive: string[]
  unfinished: RecordState['unfinished']
}

/**
 * Whether a row of the record holds every part of `runtime` as it is: the auth store and each schema module it reads.
 * A part the runtime does not read, such as a module another version needs or a resource's objects kept for older
 * code, does not count: a module's model contains the runtime's.
 */
const holdsRuntime = (runtime: RecordModel) =>
  sql.join(
    [
      sql`true`,
      ...(runtime.auth ? [sql`model -> 'auth' = ${JSON.stringify(runtime.auth)}::jsonb`] : []),
      ...Object.entries(runtime.modules ?? {}).map(([id, module]) => sql`model -> 'modules' -> ${id} @> ${JSON.stringify(module)}::jsonb`),
    ],
    sql` and `,
  )

const recordFound = async (db: Kysely<any>) => (await sql<{ found: boolean }>`select to_regclass(${recordTable}) is not null as found`.execute(db)).rows[0]!.found

/**
 * The record as the startup decides on it, for the model the runtime reads: whether the table is there, then one
 * query for the newest row, whether a row holds that model (`holdsRuntime`), the rows not marked additive since the
 * newest such row, and the unfinished rows.
 */
export const readRecordState = async (db: Kysely<any>, runtime: RecordModel): Promise<RecordState> => {
  if (!(await recordFound(db))) return { newest: undefined, matched: false, notAdditiveSince: [], unfinished: [] }
  const table = sql.raw(recordTable)
  const [row] = (
    await sql<Row>`
      with matched as (select max(applied_at) as at from ${table} where ${holdsRuntime(runtime)})
      select
        (select json_build_object('name', name, 'protobase_version', protobase_version, 'model', model) from ${table} order by applied_at desc limit 1) as newest,
        (select at is not null from matched) as matched,
        (select coalesce(json_agg(h.name order by h.applied_at), '[]') from ${table} h, matched where h.applied_at > matched.at and h.additive is not true) as not_additive,
        (select coalesce(json_agg(json_build_object('name', h.name, 'after', h.physical -> 'after') order by h.applied_at), '[]') from ${table} h where h.completed_at is null) as unfinished`.execute(db)
  ).rows
  const newest = row!.newest
  return {
    newest: newest ? { name: newest.name, version: newest.protobase_version, model: newest.model } : undefined,
    matched: row!.matched,
    notAdditiveSince: row!.not_additive,
    unfinished: row!.unfinished,
  }
}

/** Whether a row of the record holds `runtime` (`holdsRuntime`): `false` without a record. */
export const recordHasModel = async (db: Kysely<any>, runtime: RecordModel) => {
  if (!(await recordFound(db))) return false
  const [row] = (await sql<{ has: boolean }>`select exists (select from ${sql.raw(recordTable)} where ${holdsRuntime(runtime)}) as has`.execute(db)).rows
  return row!.has
}
