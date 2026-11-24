import { authMigrationTitle } from '../../auth/migration-file'
import type { MigrationPart } from '../parts'
import { authDifference } from './auth-difference'
import type { AuthTarget } from './auth-target'
import { refuseInconsistent } from './consistency'
import { readMigrationFiles } from './migration-files'
import { runPreconditions } from './preconditions'
import { readSnapshot, snapshotFile } from './snapshot-file'
import { writeMigrationFile } from './write-file'

export type MigrationRun = {
  projectDir: string
  dir: string
  /** The config's auth store; `undefined` with sign-in off. */
  auth: AuthTarget | undefined
  /** The parts compared with the database, and its URL; `undefined` without `DATABASE_URL`. */
  database: { url: string; parts: MigrationPart[] } | undefined
  protobaseVersion: string
  newId: () => string
}

const section = (title: string, sql: string) => `-- ${title}.\n${sql}\n`

/** The line `protobase migration`'s files open with, under their header. */
export const intro = `-- Written by \`protobase migration\` from the config and ${snapshotFile}; applied with the project's other migrations.\n`

/**
 * `protobase migration`: writes what the config needs as the project's next migration, one file, and rewrites the
 * snapshot to end at it. The auth store's steps come from the snapshot alone; with a database, their checks run against
 * its rows, and the other parts are compared with it. Every part is compared before anything is written. Returns the
 * file's path, `undefined` when nothing differs.
 */
export const runMigration = async ({ projectDir, dir, auth, database, protobaseVersion, newId }: MigrationRun) => {
  const snapshot = await readSnapshot(projectDir)
  const files = await readMigrationFiles(dir)
  refuseInconsistent(snapshot, files)
  if (!snapshot && auth && files.some(({ text }) => text.includes(authMigrationTitle))) {
    throw new Error(`The project has auth migrations from before ${snapshotFile}: start it with \`protobase auth migration\`, run against the database with the project's migrations applied, then run \`protobase migration\` again`)
  }
  const difference = authDifference(snapshot, auth)
  if (database && difference.migration && difference.migration.checks.length > 0) await runPreconditions(database.url, difference.migration.checks)
  const compared: Array<{ name: string; text: string }> = []
  for (const part of database?.parts ?? []) {
    const sql = await part.sql({ authWritten: Boolean(difference.migration) })
    if (sql !== undefined) compared.push({ name: part.name, text: section(part.title, sql) })
  }
  const sections = [...(difference.migration ? [{ name: 'auth', text: section(authMigrationTitle, difference.migration.sql) }] : []), ...compared]
  if (sections.length === 0) return
  // The auth store's steps only add (`step-lint.ts`); the other parts may drop what the config no longer has.
  const content = { name: sections.map(({ name }) => name).join('_'), body: [intro, ...sections.map(({ text }) => text)].join('\n'), additive: sections.every(({ name }) => name === 'auth') }
  return writeMigrationFile(projectDir, dir, content, { previous: snapshot, auth: difference.model, organizationsOn: auth?.organizationsOn ?? false, protobaseVersion }, newId())
}
