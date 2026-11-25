import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ModuleModel, SchemaModule } from '../schema-modules/schema-module'
import { callsTablesSql, guestsSchemaSql } from './calls-sql'

/** The calls schema as the database has it: step 1 once its tables are there, step 2 once its guest tables are too. */
const readCalls = async (db: Db): Promise<ModuleModel | undefined> => {
  const { rows } = await sql<{ calls: boolean; guests: boolean }>`select
      to_regclass('calls.calls') is not null and to_regclass('calls.members') is not null and to_regclass('calls.signals') is not null and to_regclass('calls.rings') is not null as calls,
      to_regclass('calls.guest_links') is not null and to_regclass('calls.guests') is not null and to_regclass('calls.organization_guests') is not null
        and exists (select from information_schema.columns where table_schema = 'calls' and table_name = 'members' and column_name = 'name') as guests`.execute(db)
  const found = rows[0]!
  if (!found.calls) return
  return { lastStep: found.guests ? 2 : 1, replaceables: {} }
}

/**
 * The `calls` schema: the calls on records, who is in them, whom they ring, their guests, and the signals between the
 * processes serving the app. Rings reach open pages through the notices table, a module of its own. Never dropped.
 */
export const callsModule: SchemaModule = {
  label: 'the calls schema',
  title: 'The calls on records, who is in them, whom they ring, their guests, and the signals between the processes serving the app',
  steps: [
    { step: 1, name: 'calls', title: 'The calls, their members, signals and rings', additive: true, sql: () => callsTablesSql },
    { step: 2, name: 'guests', title: 'The guest links, the guests and whether organizations allow them', additive: true, sql: () => guestsSchemaSql },
  ],
  replaceables: [],
  resourceReplaceables: [],
  read: readCalls,
}
