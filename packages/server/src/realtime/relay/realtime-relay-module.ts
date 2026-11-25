import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ModuleModel, SchemaModule } from '../../schema-modules/schema-module'
import { relaySchema, relaySchemaSql, relayTables, spacedTables } from './relay-schema-sql'

/**
 * The `realtime_relay` schema as the database has it: step 1 once every table is there with its `space` column.
 * Refuses one written before the record channels, which no step records.
 */
const readRealtimeRelay = async (db: Db): Promise<ModuleModel | undefined> => {
  const names = relayTables.map((table) => `${relaySchema}.${table}`)
  const { rows } = await sql<{ found: number; spaced: number }>`select
      (select count(*)::int from unnest(${names}::text[]) as name where to_regclass(name) is not null) as found,
      (select count(*)::int from information_schema.columns where table_schema = ${relaySchema} and table_name = any(${[...spacedTables]}::text[]) and column_name = 'space') as spaced`.execute(db)
  const { found, spaced } = rows[0]!
  if (found === 0) return
  if (found < relayTables.length || spaced < spacedTables.length) {
    throw new Error(`The ${relaySchema} schema lacks tables or columns no step of this version of Protobase records: bring it there with \`protobase migration\` and \`protobase migrate\` of Protobase 0.14.2 first, then run this command again`)
  }
  return { lastStep: 1, replaceables: {} }
}

/** The `realtime_relay` schema that carries broadcasts and presence between the processes serving the app. Never dropped. */
export const realtimeRelayModule: SchemaModule = {
  label: `the ${relaySchema} schema`,
  title: 'The relay of Realtime broadcasts and presence between the processes serving the app',
  steps: [{ step: 1, name: 'relay', title: 'The frames, presences, processes and rates tables', additive: true, sql: () => relaySchemaSql }],
  replaceables: [],
  resourceReplaceables: [],
  read: readRealtimeRelay,
}
