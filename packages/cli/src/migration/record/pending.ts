import type { ISql } from 'postgres'
import { recordTable } from '@protobase/server/internal'
import type { DirMigration } from './migration-dir'

// Postgres's type of a JSON array of text, as postgres.js reads it.
type Names = { names: string[] | null }

// The names the database recorded as applied: in `migrations.applied`, or, before a first `migrate`, in the
// `public.schema_migrations` of an earlier Protobase, which `migrate` adopts (`adoptPublicRecord`).
const appliedNames = async (tx: ISql) => {
  const [record] = await tx<{ applied: boolean; earlier: boolean }[]>`
    select to_regclass('migrations.applied') is not null as applied,
      (select count(*) = 2 from information_schema.columns where table_schema = 'public' and table_name = 'schema_migrations' and column_name in ('name', 'applied_at')) as earlier`
  if (record!.applied) return (await tx`select name from migrations.applied`).map((row) => row.name as string)
  if (record!.earlier) return (await tx`select name from public.schema_migrations`).map((row) => row.name as string)
  return []
}

/** The ids the record of migrations holds: those its files inserted, whichever runner applied them. */
export const recordedIds = async (tx: ISql) => {
  const [found] = await tx<{ found: boolean }[]>`select to_regclass(${recordTable}) is not null as found`
  if (!found!.found) return new Set<string>()
  const [row] = await tx.unsafe<Names[]>(`select json_agg(id) as names from ${recordTable}`)
  return new Set(row!.names ?? [])
}

/**
 * The migrations the database has not applied, in their order, read in the transaction `tx`: neither recorded by name
 * in `migrations.applied` nor, by the id of its record block, in the record of migrations, so a file another runner
 * applied, or one renamed since, is not applied twice.
 */
export const pendingIn = async (tx: ISql, migrations: DirMigration[]) => {
  const names = new Set(await appliedNames(tx))
  const ids = await recordedIds(tx)
  return migrations.filter(({ file, id }) => !names.has(file) && !(id && ids.has(id)))
}

/** The rows of the record whose `.after.sql` has not finished, by id, in the order they were applied. */
export const unfinishedIds = async (tx: ISql) => {
  const [found] = await tx<{ found: boolean }[]>`select to_regclass(${recordTable}) is not null as found`
  if (!found!.found) return []
  const [row] = await tx.unsafe<Names[]>(`select json_agg(id order by applied_at) as names from ${recordTable} where completed_at is null`)
  return row!.names ?? []
}
