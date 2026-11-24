import { randomUUID } from 'node:crypto'
import { authSchemaMigration, type AdminAuth } from '@protobase/server'
import { latestSteps, recordsRuntimeModel, storeModel, storeNames } from '@protobase/server/internal'
import { refuseInconsistent } from '../migration/snapshot/consistency'
import { readMigrationFiles } from '../migration/snapshot/migration-files'
import { readSnapshot } from '../migration/snapshot/snapshot-file'
import { writeMigrationFile } from '../migration/snapshot/write-file'
import { protobaseVersion } from '../version/version'
import { currentStoreText, migrationText, recordOnlyText } from './migration-file'

export type WriteAuthMigrationOptions = {
  auth: AdminAuth
  /** The project's folder, which holds `protobase.snapshot.json`. */
  projectDir: string
  dir: string
  name: string
  /** The command the file names as its writer, `protobase auth migration` by default. */
  writer?: string
}

/**
 * Writes the auth schema changes the database still needs as the next migration in `dir`, and returns its path;
 * `undefined` when the database is current. The changes are found by comparing the database with what Better Auth
 * needs, so the project's earlier migrations must be applied to it first. The file brings the store to every step of
 * this version, so the project's snapshot, started here when it has none, ends at it with the store there, and
 * `protobase migration` goes on from it. A project without a snapshot whose store is current, such as one whose auth
 * migrations came before the snapshot, gets a file without statements that starts it; one whose store is current but
 * not in the database's record of migrations, as before the record, a file that only records it.
 */
export const writeAuthMigration = async ({ auth, projectDir, dir, name, writer }: WriteAuthMigrationOptions) => {
  const snapshot = await readSnapshot(projectDir)
  refuseInconsistent(snapshot, await readMigrationFiles(dir))
  const sql = await authSchemaMigration(auth)
  const unrecorded = sql === undefined && !(await recordsRuntimeModel(auth))
  if (sql === undefined && snapshot && !unrecorded) return
  const names = storeNames(auth)
  const draft = { previous: snapshot, auth: storeModel(names, latestSteps(names.names.modules)), organizationsOn: Boolean(auth.organizations), protobaseVersion }
  const body = sql !== undefined ? migrationText(sql, writer) : snapshot ? recordOnlyText(writer) : currentStoreText(writer)
  return writeMigrationFile(projectDir, dir, { name, body, additive: true }, draft, randomUUID())
}
