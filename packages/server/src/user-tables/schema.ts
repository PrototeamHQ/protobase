import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { migrationCommand } from '../changes/capture-schema'
import { definitionsSchema, userTablesSchema } from './names'
import { fieldsSql, schemasSql, tablesSql } from './schema-sql'

// Only reads the catalogue.
const readUserTablesSchema = async (db: Db) => {
  const { rows } = await sql<{ tables: boolean; fields: boolean; data: boolean; trgm: boolean }>`select
    to_regclass(${`${definitionsSchema}.tables`}) is not null as tables,
    to_regclass(${`${definitionsSchema}.fields`}) is not null as fields,
    exists (select from pg_namespace where nspname = ${userTablesSchema}) as data,
    exists (select from pg_extension where extname = 'pg_trgm') as trgm`.execute(db)
  return rows[0]!
}

/**
 * The SQL that adds what user tables need: pg_trgm, the definitions schema with its `tables` and `fields`, and the
 * schema the tables themselves live in. `undefined` when current. Nothing is dropped.
 */
export const userTablesMigration = async (db: Db) => {
  const found = await readUserTablesSchema(db)
  if (found.tables && found.fields && found.data && found.trgm) return undefined
  const statements = [...schemasSql(), ...(found.tables ? [] : [tablesSql()]), ...(found.fields ? [] : [fieldsSql()])]
  return `${statements.join(';\n\n')};`
}

/** Refuses to go on while the schemas of user tables are missing; the project's migrations add them. */
export const checkUserTablesSchema = async (db: Db) => {
  const found = await readUserTablesSchema(db)
  if (found.tables && found.fields && found.data && found.trgm) return
  throw new Error(`The ${definitionsSchema} or ${userTablesSchema} schema, or pg_trgm, is missing, and userTables keeps the tables users add there. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
