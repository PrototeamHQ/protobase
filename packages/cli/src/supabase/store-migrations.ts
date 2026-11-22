import { existsSync } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { authMigrationTitle } from '../auth/migration-file'
import { readMigrationFiles } from '../migration/snapshot/migration-files'
import { removeSnapshot, snapshotFile } from '../migration/snapshot/snapshot-file'

// A new project's migrations make Protobase's own user table, `auth.user`, and the tables pointing at it. An import
// makes Supabase's auth.users the user table instead, with Better Auth's other tables planned next to it once its
// rows are loaded, so those migrations go, before any of them is applied.

/** The migrations in `dir` that `protobase auth migration` or `protobase migration` wrote for the auth schema. */
export const authStoreMigrations = async (dir: string) => {
  if (!existsSync(dir)) return []
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()
  const found: string[] = []
  for (const file of files) if ((await readFile(path.join(dir, file), 'utf8')).includes(`-- ${authMigrationTitle}`)) found.push(file)
  return found
}

/**
 * Deletes `files`, the auth store's migrations of `dir`, and, when Protobase wrote one of them, the project's
 * snapshot, which describes the store they made; the auth migration written next starts it again.
 */
export const removeStoreMigrations = async (projectDir: string, dir: string, files: string[]) => {
  const headed = (await readMigrationFiles(dir)).some(({ file, header }) => header && files.includes(file))
  for (const file of files) await rm(path.join(dir, file))
  if (headed && existsSync(path.join(projectDir, snapshotFile))) await removeSnapshot(projectDir)
}
