import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ModuleInput, ModuleModel, SchemaModule } from '../../schema-modules/schema-module'
import { quoteIdent } from '../capture-sql'
import { schemaMessagesFunction, schemaMessagesSql, schemaMessagesTriggers } from './schema-messages-sql'

/**
 * The schema change messages as the database has them: step 1 once the function is there, and the triggers at version 1
 * when both event triggers are there, enabled and calling it, else at none, so they are written again.
 */
const readStream = async (db: Db, { names }: ModuleInput): Promise<ModuleModel | undefined> => {
  const schema = names.schema!
  const { ddl, drop } = schemaMessagesTriggers(schema)
  const fn = `${quoteIdent(schema)}.${quoteIdent(schemaMessagesFunction)}`
  const { rows } = await sql<{ found: boolean; triggers: number }>`select to_regprocedure(${`${fn}()`}) is not null as found,
      (select count(*)::int from pg_event_trigger where evtname = any(${[ddl, drop]}::text[]) and evtenabled in ('O', 'A') and evtfoid = to_regprocedure(${`${fn}()`})) as triggers`.execute(db)
  const { found, triggers } = rows[0]!
  if (!found) return
  return { lastStep: 1, replaceables: triggers === 2 ? { schema_messages: 1 } : {}, names }
}

/**
 * What the change stream needs in the app's database besides the WAL itself, with `events.stream`: the event triggers
 * that write schema changes as logical messages (`schemaMessagesSql`), in the schema `events` names (`names.schema`).
 */
export const streamModule: SchemaModule = {
  label: 'the schema change messages',
  title: 'The schema change messages the change stream reads',
  steps: [{ step: 1, name: 'schema', title: 'The changes schema', additive: true, sql: (names) => `create schema if not exists ${quoteIdent(names.schema!)};` }],
  replaceables: [{ name: 'schema_messages', title: 'The event triggers that write schema changes as logical messages', version: 1, compatibleFrom: 1, sql: (names) => schemaMessagesSql(names.schema!) }],
  resourceReplaceables: [],
  read: readStream,
}
