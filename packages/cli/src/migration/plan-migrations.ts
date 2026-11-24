import type { Sql } from 'postgres'
import { readMigrationDir } from './record/migration-dir'
import { pendingIn, unfinishedIds } from './record/pending'

/** The migrations of `dir` the database has not applied, and the ids of those whose `.after.sql` has not finished, read-only. */
const pendingMigrations = async (sql: Sql, dir: string) => {
  const migrations = await readMigrationDir(dir)
  return sql.begin('read only', async (tx) => ({ migrations, pending: await pendingIn(tx, migrations), unfinished: await unfinishedIds(tx) }))
}

/**
 * `protobase migrate --plan`: prints each `.after.sql` a stopped run left unfinished, then each migration of `dir` that
 * `migrate` would apply, in its order, under its name, with its SQL and its `.after.sql`: it applies and records
 * nothing. Returns the names it would apply.
 */
export const planMigrations = async (sql: Sql, dir: string, out: (text: string) => void) => {
  const { migrations, pending, unfinished } = await pendingMigrations(sql, dir)
  for (const id of unfinished) {
    const after = migrations.find((migration) => migration.id === id)?.after
    out(after ? `-- ${after.file}, to finish\n${after.text.trimEnd()}\n\n` : `-- ${id} is unfinished, and no migration of the folder finishes it\n\n`)
  }
  for (const { file, text, after } of pending) {
    out(`-- ${file}\n${text.trimEnd()}\n\n`)
    if (after) out(`-- ${after.file}, outside a transaction once ${file} commits\n${after.text.trimEnd()}\n\n`)
  }
  const finishing = unfinished.length > 0 ? `${unfinished.length} to finish; ` : ''
  out(pending.length > 0 || unfinished.length > 0 ? `${finishing}${pending.length} migrations to apply; nothing was applied\n` : 'the database is up to date\n')
  return pending.map(({ file }) => file)
}
