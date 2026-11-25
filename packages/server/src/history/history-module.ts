import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent } from '../changes/capture-sql'
import { hasIndexes } from '../has-indexes'
import type { ModuleInput, ModuleModel, SchemaModule } from '../schema-modules/schema-module'
import { historyIndexes, historyTableSql } from './history-sql'

/** The history table as the database has it: step 1 once it is there with every index. Refuses one without them, which no step records. */
const readHistory = async (db: Db, { names }: ModuleInput): Promise<ModuleModel | undefined> => {
  const schema = names.schema!
  const { rows } = await sql<{ found: boolean }>`select to_regclass(${`${quoteIdent(schema)}."history"`}) is not null as found`.execute(db)
  if (!rows[0]!.found) return
  if (!(await hasIndexes(db, schema, 'history', historyIndexes.map(([name]) => name)))) {
    throw new Error(`The history table in schema "${schema}" lacks indexes no step of this version of Protobase records: add them with \`protobase migration\` and \`protobase migrate\` of Protobase 0.14.2 first, then run this command again`)
  }
  return { lastStep: 1, replaceables: {}, names }
}

/** The history table of the resources with `.history()`, in the schema `events` names (`names.schema`). */
export const historyModule: SchemaModule = {
  label: 'the history table',
  title: 'The history table of the resources with history',
  steps: [{ step: 1, name: 'history', title: 'The history table and its indexes', additive: true, sql: (names) => `create schema if not exists ${quoteIdent(names.schema!)};\n${historyTableSql(names.schema!)};` }],
  replaceables: [],
  resourceReplaceables: [],
  read: readHistory,
}
