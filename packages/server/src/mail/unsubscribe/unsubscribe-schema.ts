import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { migrationCommand } from '../../changes/capture-schema'
import { hasIndexes } from '../../has-indexes'
import { unsubscribesSchema, unsubscribesTable } from './unsubscribe-store'

/** The table's indexes by name: the unique one the send's check and the admin list's recipient filter read, and the list's topic filter and sort. */
const indexes = [
  ['unsubscribes_recipient_topic', 'unique', '"recipient", "topic"'],
  ['unsubscribes_topic', '', '"topic"'],
  ['unsubscribes_created_at', '', '"created_at"'],
] as const

/** A row per recipient, lower-cased, and topic they unsubscribed from, with when. */
export const unsubscribesTableSql = () => `create schema if not exists "${unsubscribesSchema}";

create table if not exists ${unsubscribesTable} (
  "id" bigint generated always as identity primary key,
  "recipient" text not null check ("recipient" = lower("recipient")),
  "topic" text not null,
  "created_at" timestamptz not null
);

${indexes.map(([name, kind, columns]) => `create ${kind ? `${kind} ` : ''}index if not exists "${name}" on ${unsubscribesTable} (${columns});`).join('\n')}`

// Only reads the catalogue.
const hasTable = async (db: Db) => (await sql<{ found: boolean }>`select to_regclass(${unsubscribesTable}) is not null as found`.execute(db)).rows[0]!.found

/** The SQL that adds the opt-outs' schema and table, or the indexes it lacks; `undefined` when it has them all. */
export const unsubscribesMigration = async (db: Db) => {
  if ((await hasTable(db)) && (await hasIndexes(db, unsubscribesSchema, 'unsubscribes', indexes.map(([name]) => name)))) return
  return unsubscribesTableSql()
}

/** Refuses to start while `unsubscribe` is on and its table is missing; the project's migrations add it. */
export const checkUnsubscribesSchema = async (db: Db) => {
  if (await hasTable(db)) return
  throw new Error(`The opt-outs table ${unsubscribesTable} of unsubscribe is missing. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
