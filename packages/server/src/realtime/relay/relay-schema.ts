import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { migrationCommand } from '../../changes/capture-schema'
import { relaySchema, relaySchemaSql, relayTables, spacedTables } from './relay-schema-sql'

// Only reads the catalogue: every table, and the `space` column of those that have one.
const relayCurrent = async (db: Db) => {
  const names = relayTables.map((table) => `${relaySchema}.${table}`)
  const { rows } = await sql<{ found: boolean }>`select bool_and(to_regclass(name) is not null) as found from unnest(${names}::text[]) as name`.execute(db)
  if (!rows[0]!.found) return false
  const spaced = await sql<{ count: number }>`select count(*)::int as count from information_schema.columns
    where table_schema = ${relaySchema} and table_name = any(${[...spacedTables]}::text[]) and column_name = 'space'`.execute(db)
  return spaced.rows[0]!.count === spacedTables.length
}

/** The SQL that adds the `realtime_relay` schema `realtime: { processes: 'many' }` needs; `undefined` when it is there. */
export const realtimeRelayMigration = async (db: Db) => ((await relayCurrent(db)) ? undefined : relaySchemaSql)

/** Refuses to go on while the `realtime_relay` schema is missing; the project's migrations add it. */
export const checkRealtimeRelay = async (db: Db) => {
  if (await relayCurrent(db)) return
  throw new Error(`The ${relaySchema} schema that realtime.processes "many" needs is missing. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
