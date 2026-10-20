import type postgres from 'postgres'
import { qualified, type DumpedTable } from './load-script'

/** The roles Supabase's API switches to, which the imported grants and policies name, as Supabase makes them. */
const apiRoles = [
  { name: 'anon', create: 'CREATE ROLE anon NOLOGIN NOINHERIT' },
  { name: 'authenticated', create: 'CREATE ROLE authenticated NOLOGIN NOINHERIT' },
  { name: 'service_role', create: 'CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS' },
]

/**
 * Makes the API roles the target lacks, when the importing role may make them as Supabase does (service_role bypasses
 * row level security, which only a role that does may grant), and returns their names; otherwise fails, naming them
 * and the statements an administrator runs.
 */
export const ensureApiRoles = async (sql: postgres.Sql) => {
  const existing = new Set((await sql<{ name: string }[]>`select rolname as name from pg_roles where rolname = any(${apiRoles.map((role) => role.name)})`).map((row) => row.name))
  const missing = apiRoles.filter((role) => !existing.has(role.name))
  if (missing.length === 0) return []
  const [me] = await sql<{ name: string; superuser: boolean; createrole: boolean; bypassrls: boolean }[]>`
    select rolname as name, rolsuper as superuser, rolcreaterole as createrole, rolbypassrls as bypassrls from pg_roles where rolname = current_user
  `
  const may = me!.superuser || (me!.createrole && (me!.bypassrls || missing.every((role) => role.name !== 'service_role')))
  if (!may) {
    throw new Error(
      `The database lacks the roles ${missing.map((role) => role.name).join(', ')}, which the imported grants and policies name, and ${me!.name} may not create them; have an administrator run: ${missing.map((role) => `${role.create};`).join(' ')}`,
    )
  }
  for (const role of missing) await sql.unsafe(role.create)
  return missing.map((role) => role.name)
}

/** The dumped tables that `sql`'s database has already, which the schema migration would fail to create. */
export const existingTables = async (sql: postgres.Sql, tables: DumpedTable[]) => {
  const names = tables.map(qualified)
  const rows = await sql<{ name: string }[]>`select name from unnest(${names}::text[]) as name where to_regclass(name) is not null`
  return rows.map((row) => row.name)
}

/** The schemas of `schemas` that `sql`'s database has already, which the schema migration would fail to create. */
export const existingSchemas = async (sql: postgres.Sql, schemas: string[]) => {
  const rows = await sql<{ name: string }[]>`select nspname as name from pg_namespace where nspname = any(${schemas}) order by 1`
  return rows.map((row) => row.name)
}

/** The dumped tables that hold rows on the target, which a load would add to. */
export const filledTables = async (sql: postgres.Sql, tables: DumpedTable[]) => {
  const filled: string[] = []
  for (const table of tables) {
    const [row] = await sql<{ filled: boolean }[]>`select exists (select 1 from ${sql(table.schema)}.${sql(table.table)}) as filled`
    if (row!.filled) filled.push(qualified(table))
  }
  return filled
}

/** The tables in `schemas` that are not among the imported `tables`, such as the project's own, as `schema.table`. */
export const otherTables = async (sql: postgres.Sql, schemas: string[], tables: DumpedTable[]) => {
  const imported = tables.map((table) => `${table.schema}.${table.table}`)
  const rows = await sql<{ name: string }[]>`
    select n.nspname || '.' || c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and n.nspname = any(${schemas}) and n.nspname || '.' || c.relname <> all(${imported})
    order by 1
  `
  return rows.map((row) => row.name)
}
