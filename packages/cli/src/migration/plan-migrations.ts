import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Sql, TransactionSql } from 'postgres'

// The names the database recorded as applied: in `migrations.applied`, or, before a first `migrate`, in the
// `public.schema_migrations` of an earlier Protobase, which `migrate` adopts (`adoptPublicRecord`).
const appliedNames = async (tx: TransactionSql) => {
  const [record] = await tx<{ applied: boolean; earlier: boolean }[]>`
    select to_regclass('migrations.applied') is not null as applied,
      (select count(*) = 2 from information_schema.columns where table_schema = 'public' and table_name = 'schema_migrations' and column_name in ('name', 'applied_at')) as earlier`
  if (record!.applied) return (await tx`select name from migrations.applied`).map((row) => row.name as string)
  if (record!.earlier) return (await tx`select name from public.schema_migrations`).map((row) => row.name as string)
  return []
}

/**
 * `protobase migrate --plan`: prints each `*.sql` file of `dir` that `migrate` would apply, in its order, under its
 * name, with its SQL, from a read-only transaction: it applies and records nothing. Returns the names.
 */
export const planMigrations = async (sql: Sql, dir: string, out: (text: string) => void) => {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()
  const done = new Set(await sql.begin('read only', (tx) => appliedNames(tx)))
  const pending = files.filter((file) => !done.has(file))
  for (const file of pending) out(`-- ${file}\n${(await readFile(path.join(dir, file), 'utf8')).trimEnd()}\n\n`)
  out(pending.length > 0 ? `${pending.length} migrations to apply; nothing was applied\n` : 'the database is up to date\n')
  return pending
}
