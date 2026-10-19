import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent } from '../changes/capture-sql'
import type { ResourceChange } from '../changes/resource-change'

/**
 * The recent changes of the resources with `.live()`, which open pages refresh from: a row per record and transaction,
 * its key and never its values. `id` grows in commit order, since one dispatch writes at a time.
 */
export const noticesTableSql = (schema: string) => {
  const table = `${quoteIdent(schema)}."notices"`
  return `create table if not exists ${table} (
  "id" bigint generated always as identity primary key,
  "resource" text not null,
  "record_key" text not null,
  "tenant_id" text,
  "operation" text not null check ("operation" in ('create', 'update', 'delete', 'undelete')),
  "at" timestamptz not null default now()
);
create index if not exists "notices_at" on ${table} ("at")`
}

/** One change an open page hears of. */
export type Notice = { id: string; resource: string; key: string; operation: ResourceChange['operation']; tenant: string | null }

type NoticeRow = { id: string; resource: string; record_key: string; tenant_id: string | null; operation: Notice['operation'] }

const noticeOf = (row: NoticeRow): Notice => ({ id: row.id, resource: row.resource, key: row.record_key, operation: row.operation, tenant: row.tenant_id })

const tableOf = (schema: string) => sql.raw(`${quoteIdent(schema)}."notices"`)

/** How long a notice is kept: what a page that lost its connection for longer reads again whole. */
export const keptMinutes = 10

/**
 * Adds the changes as notices, in their order, and deletes those older than `keptMinutes`, but never the newest, so a
 * reader's last notice is gone only once a later one was pruned. One dispatch's transaction does both.
 */
export const writeNotices = async (db: Db, schema: string, changes: readonly ResourceChange[]) => {
  if (changes.length === 0) return
  const table = tableOf(schema)
  const rows = JSON.stringify(changes.map((change) => ({ resource: change.resource, record_key: change.key, tenant_id: change.tenant === undefined ? null : String(change.tenant), operation: change.operation })))
  await sql`insert into ${table} ("resource", "record_key", "tenant_id", "operation")
    select "resource", "record_key", "tenant_id", "operation" from rows from (jsonb_to_recordset(${rows}::jsonb) as ("resource" text, "record_key" text, "tenant_id" text, "operation" text)) with ordinality as r("resource", "record_key", "tenant_id", "operation", "position")
    order by "position"`.execute(db)
  await sql`delete from ${table} where "at" < now() - make_interval(mins => ${keptMinutes}) and "id" < (select max("id") from ${table})`.execute(db)
}

/** The newest notice's id, `0` without any. */
export const lastNotice = async (db: Db, schema: string) =>
  (await sql<{ id: string }>`select coalesce(max("id"), 0)::text as id from ${tableOf(schema)}`.execute(db)).rows[0]!.id

/** At most `limit` notices after `after`, in order. */
export const noticesAfter = async (db: Db, schema: string, after: string, limit: number) => {
  const { rows } = await sql<NoticeRow>`select "id"::text as id, "resource", "record_key", "tenant_id", "operation" from ${tableOf(schema)}
    where "id" > ${after}::bigint order by "id" limit ${limit}`.execute(db)
  return rows.map(noticeOf)
}

/** Whether the notice `id` is still kept; `0`, the cursor of an empty table, only while the table is empty still. */
export const noticeKept = async (db: Db, schema: string, id: string) => {
  const query = id === '0' ? sql<{ kept: boolean }>`select not exists (select from ${tableOf(schema)}) as kept` : sql<{ kept: boolean }>`select exists (select from ${tableOf(schema)} where "id" = ${id}::bigint) as kept`
  return (await query.execute(db)).rows[0]!.kept
}
