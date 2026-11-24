import { sql, type Kysely } from 'kysely'
import { latestModules, modelHash, recordTable, type RecordModel, type SchemaModuleId } from '@protobase/server/internal'
import { recordBlock } from '../../src/migration/record/record-block'

/**
 * Records on `db` a migration that made the schema modules `ids` as this version writes them, on top of the auth store
 * the record's newest row holds, as a file's record block does once applied: what the server's startup reads for an
 * app that needs them.
 */
export const recordModules = async (db: Kysely<any>, ids: readonly SchemaModuleId[] = ['jobs']) => {
  const [found] = (await sql<{ found: boolean }>`select to_regclass(${recordTable}) is not null as found`.execute(db)).rows
  const newest = found!.found ? (await sql<{ model: RecordModel }>`select model from ${sql.raw(recordTable)} order by applied_at desc limit 1`.execute(db)).rows[0] : undefined
  const model: RecordModel = { ...(newest?.model.auth && { auth: newest.model.auth }), modules: latestModules(ids) }
  const row = { id: 'modules', number: null, name: 'modules', protobaseVersion: '1.0.0', model, modelHash: modelHash(model), physical: {}, additive: true, completed: true }
  await sql.raw(recordBlock(row, null)).execute(db)
}
