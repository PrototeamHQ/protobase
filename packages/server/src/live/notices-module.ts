import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent } from '../changes/capture-sql'
import type { ModuleInput, ModuleModel, SchemaModule } from '../schema-modules/schema-module'
import { noticesTableSql } from './notices-sql'

/** The notices table as the database has it: step 1 once it is there. */
const readNotices = async (db: Db, { names }: ModuleInput): Promise<ModuleModel | undefined> => {
  const { rows } = await sql<{ found: boolean }>`select to_regclass(${`${quoteIdent(names.schema!)}."notices"`}) is not null as found`.execute(db)
  return rows[0]!.found ? { lastStep: 1, replaceables: {}, names } : undefined
}

/** The notices table the open pages of the resources with `.live()` refresh from, in the schema `events` names (`names.schema`). */
export const noticesModule: SchemaModule = {
  label: 'the notices table',
  title: 'The notices table of the resources with live updates',
  steps: [{ step: 1, name: 'notices', title: 'The notices table', additive: true, sql: (names) => `create schema if not exists ${quoteIdent(names.schema!)};\n${noticesTableSql(names.schema!)};` }],
  replaceables: [],
  resourceReplaceables: [],
  read: readNotices,
}
