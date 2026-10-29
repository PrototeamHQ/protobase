import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { migrationCommand } from '../changes/capture-schema'
import { sendsSchema, sendsSchemaSql } from './sends-schema-sql'

// Only reads the catalogue.
const sendsCurrent = async (db: Db) => {
  const { rows } = await sql<{ found: boolean }>`select to_regclass(${`${sendsSchema}.sends`}) is not null
    and to_regprocedure(${`${sendsSchema}.send(text, text, text, jsonb)`}) is not null as found`.execute(db)
  return rows[0]!.found
}

/** The SQL that adds the `channels` schema `realtime: { sqlSends: true }` needs; `undefined` when it is there. */
export const channelSendsMigration = async (db: Db) => ((await sendsCurrent(db)) ? undefined : sendsSchemaSql)

/** Refuses to go on while the `channels` schema is missing; the project's migrations add it. */
export const checkChannelSends = async (db: Db) => {
  if (await sendsCurrent(db)) return
  throw new Error(`The ${sendsSchema} schema that realtime.sqlSends needs is missing. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
