import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { authSchemaMigration, type AdminAuth } from '@protobase/server'
import { migrationText, nextMigrationName } from './migration-file'

export type WriteAuthMigrationOptions = { auth: AdminAuth; dir: string; name: string }

/**
 * Writes the auth schema changes the database still needs as the next migration in `dir`, and returns its path;
 * `undefined` when the database is current. The changes are found by comparing the database with what Better Auth
 * needs, so the project's earlier migrations must be applied to it first.
 */
export const writeAuthMigration = async ({ auth, dir, name }: WriteAuthMigrationOptions) => {
  const sql = await authSchemaMigration(auth)
  if (sql === undefined) return undefined
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, nextMigrationName(await readdir(dir), name))
  await writeFile(file, migrationText(sql), { flag: 'wx' })
  return file
}
