import { existsSync } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { authMigrationTitle } from '../auth/migration-file'
import { readMigrationFiles } from '../migration/snapshot/migration-files'
import { intro } from '../migration/snapshot/run-migration'
import { removeSnapshot, snapshotFile } from '../migration/snapshot/snapshot-file'

// A new project's migrations make Protobase's own user table, `auth.user`, and the tables pointing at it. An import
// makes Supabase's auth.users the user table instead, with Better Auth's other tables planned next to it once its
// rows are loaded, so those migrations go, before any of them is applied.

const headerLine = /^-- protobase:[a-z-]+(?: .*)?$/

/**
 * Whether `text` opens with the auth migration's title, after what Protobase starts a file with: the `-- protobase:`
 * lines and `protobase migration`'s intro.
 */
const isAuthMigration = (text: string) => {
  const lines = text.split('\n')
  const body = lines.slice(lines.findIndex((row) => !headerLine.test(row))).join('\n')
  const rest = body.startsWith(intro) ? body.slice(intro.length).trimStart() : body
  return rest.startsWith(`-- ${authMigrationTitle}`)
}

/** The migrations in `dir` that `protobase auth migration` or `protobase migration` wrote for the auth schema. */
export const authStoreMigrations = async (dir: string) => {
  if (!existsSync(dir)) return []
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()
  const found: string[] = []
  for (const file of files) if (isAuthMigration(await readFile(path.join(dir, file), 'utf8'))) found.push(file)
  return found
}

// `protobase migration` names a file after its sections, the auth store's first: one named anything but `auth` after
// its number also holds other features' statements, which removing it would lose.
const authOnly = /^\d+_auth\.sql$/

/**
 * Refuses when one of `files`, the auth store's migrations of `dir`, that Protobase wrote holds other features'
 * statements too, or when Protobase wrote one of them and one of the migrations that stay, since removing the snapshot
 * with the first leaves no snapshot ending at the second.
 */
export const refuseStoreRemoval = async (dir: string, files: string[]) => {
  const migrations = await readMigrationFiles(dir)
  const mixed = migrations.filter(({ file, header }) => header && files.includes(file) && !authOnly.test(file)).map(({ file }) => file)
  if (mixed.length > 0) throw new Error(`${mixed.join(', ')} ${mixed.length === 1 ? 'holds' : 'hold'} other features' statements next to the auth migrations Supabase's users replace; move them to a migration of their own first, leaving the auth statements in a file named \`<number>_auth.sql\``)
  const headed = migrations.some(({ file, header }) => header && files.includes(file))
  const kept = migrations.filter(({ file, header }) => header && !files.includes(file)).map(({ file }) => file)
  if (headed && kept.length > 0) throw new Error(`${kept.join(', ')} ${kept.length === 1 ? 'was' : 'were'} written by \`protobase migration\` after the auth migrations Supabase's users replace; drop ${kept.length === 1 ? 'it' : 'them'} with \`protobase migration drop\` first`)
}

/**
 * Deletes `files`, the auth store's migrations of `dir`, and, when Protobase wrote one of them, the project's
 * snapshot, which describes the store they made; the auth migration written next starts it again. Refuses first, as
 * `refuseStoreRemoval` does, deleting nothing.
 */
export const removeStoreMigrations = async (projectDir: string, dir: string, files: string[]) => {
  await refuseStoreRemoval(dir, files)
  const headed = (await readMigrationFiles(dir)).some(({ file, header }) => header && files.includes(file))
  for (const file of files) await rm(path.join(dir, file))
  if (headed && existsSync(path.join(projectDir, snapshotFile))) await removeSnapshot(projectDir)
}
