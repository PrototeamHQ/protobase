import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent } from '../changes/capture-sql'
import { relationFound } from '../relation-found'

// What the workflows modules' `read` finds in the catalogue of the workflows schema. Only reads.

/** Whether the schema has each of the tables. */
export const tablesFound = async (db: Db, schema: string, tables: readonly string[]) => {
  for (const table of tables) if (!(await relationFound(db, `${quoteIdent(schema)}.${quoteIdent(table)}`))) return false
  return true
}

/** Whether every one of the database triggers is on a table of the schema: a trigger can be dropped while its function stays. */
export const triggersFound = async (db: Db, schema: string, triggers: readonly string[]) => {
  const { rows } = await sql<{ found: number }>`select count(distinct t.tgname)::int as found from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = ${schema} and not t.tgisinternal and t.tgname = any(${triggers}::text[])`.execute(db)
  return rows[0]!.found === triggers.length
}

/** The comment on the schema's function of the name, `null` when it has none or there is no such function. */
export const functionComment = async (db: Db, schema: string, name: string) => {
  const { rows } = await sql<{ comment: string | null }>`select obj_description(p.oid, 'pg_proc') as comment from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = ${schema} and p.proname = ${name}`.execute(db)
  return rows[0]?.comment ?? null
}
