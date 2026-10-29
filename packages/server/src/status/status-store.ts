import type { PersonStatus, StatusInput } from '@protobase/schema/internal'
import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { qualified } from '../notifications/schema-sql'
import type { StatusNames } from './options'

/** Where statuses are read and written: the statuses table, and auth's members table, which says who shares an organization. */
export type StatusTables = { statuses: StatusNames; members: { schema: string | undefined; table: string } }

type Row = { user_id: string; availability: PersonStatus['availability']; text: string | null; clears_at: Date | null }

const statusOf = (row: Row): PersonStatus => ({ userId: String(row.user_id), availability: row.availability, text: row.text, clearsAt: row.clears_at?.toISOString() ?? null })

// A status holds until its clear time: a passed one reads as none, whether or not its row is still there.
const holds = sql`(clears_at is null or clears_at > now())`

/** The person's own status, as it holds now; `undefined` when they have none. */
export const ownStatus = async (db: Db, tables: StatusTables, userId: string) => {
  const statuses = sql.raw(qualified(tables.statuses))
  const { rows } = await sql<Row>`select user_id, availability, text, clears_at from ${statuses} where user_id = ${userId} and ${holds}`.execute(db)
  return rows[0] && statusOf(rows[0])
}

/** The statuses that hold now of everyone who shares an organization with `viewerId`, their own included when they have one. */
export const visibleStatuses = async (db: Db, tables: StatusTables, viewerId: string) => {
  const statuses = sql.raw(qualified(tables.statuses))
  const members = sql.raw(qualified(tables.members))
  const { rows } = await sql<Row>`select s.user_id, s.availability, s.text, s.clears_at from ${statuses} s
    where ${holds} and exists (select from ${members} own join ${members} other on other.organization_id = own.organization_id
      where own.user_id = ${viewerId} and other.user_id = s.user_id)
    order by s.user_id`.execute(db)
  return rows.map(statusOf)
}

/** Sets the person's status, replacing the one they had; one that says nothing, automatic without a text, clears it. */
export const setStatus = async (db: Db, tables: StatusTables, userId: string, input: StatusInput) => {
  if (input.availability === 'automatic' && input.text === null) return clearStatus(db, tables, userId)
  const statuses = sql.raw(qualified(tables.statuses))
  await sql`insert into ${statuses} (user_id, availability, text, clears_at, updated_at) values (${userId}, ${input.availability}, ${input.text}, ${input.clearsAt}, now())
    on conflict (user_id) do update set availability = excluded.availability, text = excluded.text, clears_at = excluded.clears_at, updated_at = excluded.updated_at`.execute(db)
}

/** Clears the person's status, whether or not they had one. */
export const clearStatus = async (db: Db, tables: StatusTables, userId: string) => {
  await sql`delete from ${sql.raw(qualified(tables.statuses))} where user_id = ${userId}`.execute(db)
}
