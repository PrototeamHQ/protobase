import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { definitionsSchema, userTablesSchema } from './names'

/** What the database has of the schemas user tables need, read from the catalogue. `to_regclass` resolves an index too. */
export const readUserTablesSchema = async (db: Db) => {
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

/** Whether every part this version's step makes is there. */
export const userTablesCurrent = (found: Awaited<ReturnType<typeof readUserTablesSchema>>) =>
  found.tables && found.versionDefault && found.organizations && found.fields && found.positionIndex && found.data && found.trgm
