import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { migrationCommand } from '../changes/capture-schema'
import { definitionsSchema, userTablesSchema } from './names'
import { fieldsPositionIndexSql, fieldsSql, nameIndexesSql, fieldsOrganizationSql, organizationsSql, schemasSql, tablesSql, versionDefaultSql } from './schema-sql'

// Only reads the catalogue. `to_regclass` resolves any relation in `pg_class`, an index such as `fields_position_idx` too.
const current = (found: Awaited<ReturnType<typeof readUserTablesSchema>>) => found.tables && found.versionDefault && found.organizations && found.fields && found.positionIndex && found.data && found.trgm

const readUserTablesSchema = async (db: Db) => {
  const { rows } = await sql<{ tables: boolean; versionDefault: boolean; organizations: boolean; fields: boolean; positionIndex: boolean; data: boolean; trgm: boolean }>`select
    to_regclass(${`${definitionsSchema}.tables`}) is not null as tables,
    exists (select from information_schema.columns where table_schema = ${definitionsSchema} and table_name = 'tables' and column_name = 'version' and column_default is not null) as "versionDefault",
    exists (select from information_schema.columns where table_schema = ${definitionsSchema} and table_name = 'tables' and column_name = 'table_name') as organizations,
    to_regclass(${`${definitionsSchema}.fields`}) is not null as fields,
    to_regclass(${`${definitionsSchema}.fields_position_idx`}) is not null as "positionIndex",
    exists (select from pg_namespace where nspname = ${userTablesSchema}) as data,
    exists (select from pg_extension where extname = 'pg_trgm') as trgm`.execute(db)
  return rows[0]!
}

/**
 * The SQL that adds what user tables need: pg_trgm, the definitions schema with its `tables` and `fields`, and the
 * schema the tables themselves live in. `undefined` when current. Nothing is dropped but the unique constraint on a
 * definition's name, which a name unique per organization replaces.
 */
export const userTablesMigration = async (db: Db) => {
  const found = await readUserTablesSchema(db)
  if (current(found)) return undefined
  // Definition tables made before organizations are brought up to date; new ones are made in their current shape.
  const tables = found.tables ? [...(found.versionDefault ? [] : [versionDefaultSql()]), ...(found.organizations ? [] : organizationsSql())] : [tablesSql(), ...nameIndexesSql()]
  const fields = found.fields ? (found.tables && !found.organizations ? [fieldsOrganizationSql()] : []) : [fieldsSql()]
  const statements = [...schemasSql(), ...tables, ...fields, fieldsPositionIndexSql()]
  return `${statements.join(';\n\n')};`
}

/** Refuses to go on while the schemas of user tables are missing; the project's migrations add them. */
export const checkUserTablesSchema = async (db: Db) => {
  const found = await readUserTablesSchema(db)
  if (current(found)) return
  throw new Error(`The ${definitionsSchema} or ${userTablesSchema} schema, the default of a definition's version, a definition's organization, the position index of its fields, or pg_trgm, is missing, and userTables keeps the tables users add there. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
