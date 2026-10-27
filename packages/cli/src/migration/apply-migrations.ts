import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Sql } from 'postgres'
import { adoptPublicRecord } from './adopt-public-record'

// The key of the presets' db/migrate.ts scripts too, so this runner and theirs take turns on one database.
const lockKey = 7_311_946_202

// Each file runs as the text of a PL/pgSQL EXECUTE, passed as a setting so it needs no quoting: Postgres refuses
// BEGIN, COMMIT, ROLLBACK, SAVEPOINT and a committing DO or procedure there, and statements that cannot run in a
// transaction, so no file ends the transaction early.
const executeFile = "do $migration$ begin execute current_setting('migrations.file'); end $migration$"

/**
 * Applies the `*.sql` files of `dir` not yet recorded in `migrations.applied`, in file name order and in one
 * transaction behind an advisory lock: when one fails, none is applied. Run it before a new version serves, while
 * nothing else writes. Returns the names it applied.
 */
export const applyMigrations = async (sql: Sql, dir: string, out: (text: string) => void) => {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()
  const applied = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${lockKey})`
    const [record] = await tx<{ fresh: boolean }[]>`select to_regclass('migrations.applied') is null as fresh`
    await tx`create schema if not exists migrations`
    await tx`create table if not exists migrations.applied (name text primary key, applied_at timestamptz not null default now())`
    if (record!.fresh) await adoptPublicRecord(tx)
    const done = new Set((await tx`select name from migrations.applied`).map((row) => row.name as string))
    const pending = files.filter((file) => !done.has(file))
    for (const file of pending) {
      out(`applying ${file}\n`)
      await tx`select set_config('migrations.file', ${await readFile(path.join(dir, file), 'utf8')}, true)`
      await tx.unsafe(executeFile)
      await tx`insert into migrations.applied (name) values (${file})`
    }
    return pending
  })
  out(applied.length > 0 ? `applied ${applied.length} migrations\n` : 'the database is up to date\n')
  return applied
}
