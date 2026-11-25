import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ModuleModel, SchemaModule } from '../schema-modules/schema-module'
import { sendFunctionSql, sendsSchema, sendsTableSql } from './sends-schema-sql'

/** The `channels` schema as the database has it: step 1 once the sends table is there, and `send()` once it is. */
const readSends = async (db: Db): Promise<ModuleModel | undefined> => {
  const { rows } = await sql<{ table: boolean; send: boolean }>`select to_regclass(${`${sendsSchema}.sends`}) is not null as table,
    to_regprocedure(${`${sendsSchema}.send(text, text, text, jsonb)`}) is not null as send`.execute(db)
  const found = rows[0]!
  if (!found.table) return
  return { lastStep: 1, replaceables: found.send ? { send: 1 } : {} }
}

/** The `channels` schema of SQL's broadcasts to the record channels, and `channels.send()`. Never dropped. */
export const channelSendsModule: SchemaModule = {
  label: `the ${sendsSchema} schema`,
  title: "SQL's broadcasts to the record channels, channels.send()",
  steps: [{ step: 1, name: 'sends', title: 'The sends table', additive: true, sql: () => sendsTableSql }],
  replaceables: [{ name: 'send', title: 'The function SQL sends with, channels.send()', version: 1, compatibleFrom: 1, sql: () => sendFunctionSql }],
  resourceReplaceables: [],
  read: readSends,
}
