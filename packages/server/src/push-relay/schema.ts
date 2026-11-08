import type { Db } from '@protobase/query'
import { migrationCommand } from '../changes/capture-schema'
import { regclass } from '../notifications/schema'
import { credentialsTable, credentialsTableSql, handlesTable, handlesTableSql, pushRelaySchema } from './schema-sql'

const tables = [
  { name: handlesTable, sql: handlesTableSql },
  { name: credentialsTable, sql: credentialsTableSql },
]

/** The SQL that adds the relay's tables that are missing, in the `push_relay` schema; `undefined` when none is. */
export const pushRelayMigration = async (db: Db) => {
  const missing = []
  for (const table of tables) if ((await regclass(db, table.name)) === null) missing.push(table.sql)
  if (missing.length === 0) return
  return `${[`create schema if not exists ${pushRelaySchema}`, ...missing].join(';\n\n')};`
}

/** Refuses to start while a table of the relay is missing, naming it. */
export const checkPushRelaySchema = async (db: Db) => {
  for (const table of tables) {
    if ((await regclass(db, table.name)) !== null) continue
    throw new Error(`The table ${table.name} of pushRelay is missing. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
  }
}
