import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { ringNotice, type CallRing } from '@protobase/schema/internal'
import { quoteIdent } from '../changes/capture-sql'

/** What a ring says, as the app gives it: the bell and the ringing page show it. */
export type RingText = { title: string; body: string | null }

const users = (values: readonly string[]) => `{${values.map((value) => JSON.stringify(value)).join(',')}}`

/** Rings these users for the call until `seconds` from now; a user it rang already is not rung again. The users it rang. */
export const startRings = async (db: Db, call: string, userIds: readonly string[], text: RingText, seconds: number) => {
  if (userIds.length === 0) return []
  const { rows } = await sql<{ user_id: string }>`insert into "calls"."rings" ("call_id", "user_id", "title", "body", "rung_at", "until")
    select ${call}::uuid, u, ${text.title}, ${text.body}, now(), now() + make_interval(secs => ${seconds}) from unnest(${users(userIds)}::text[]) as u
    on conflict ("call_id", "user_id") do nothing returning "user_id"`.execute(db)
  return rows.map((row) => row.user_id)
}

/** Stops the call ringing the user, as when they joined or declined it: whether it rang them still. */
export const stopRing = async (db: Db, call: string, userId: string) => {
  const { rows } = await sql<{ user_id: string }>`update "calls"."rings" set "stopped_at" = now()
    where "call_id" = ${call}::uuid and "user_id" = ${userId} and "stopped_at" is null and "until" > now() returning "user_id"`.execute(db)
  return rows.length > 0
}

/** Stops the rings of calls that ended: the users they rang still. */
export const stopEndedRings = async (db: Db) => {
  const { rows } = await sql<{ user_id: string }>`update "calls"."rings" r set "stopped_at" = now() from "calls"."calls" c
    where c."id" = r."call_id" and r."stopped_at" is null and r."until" > now() and c."ended_at" is not null returning r."user_id"`.execute(db)
  return [...new Set(rows.map((row) => row.user_id))]
}

/** How many rings a page shows at once at most: the newest. */
const shownRings = 5

/** The calls that ring the user now, newest first. */
export const ringsOf = async (db: Db, userId: string): Promise<CallRing[]> => {
  const { rows } = await sql<CallRing>`select r."call_id"::text as call, c."resource", c."record_key" as key, c."started_by", r."title", r."body",
      greatest(0, ceil(extract(epoch from r."until" - now()) * 1000))::int as remaining_ms
    from "calls"."rings" r join "calls"."calls" c on c."id" = r."call_id"
    where r."user_id" = ${userId} and r."stopped_at" is null and r."until" > now() and c."ended_at" is null
    order by r."rung_at" desc limit ${shownRings}`.execute(db)
  return rows
}

/**
 * Tells these users' open pages, through the live stream's notices, that the calls ringing them changed. The table is
 * locked against other writers first, so the notice commits in the order of its id and no reader skips it.
 */
export const writeRingNotices = async (db: Db, schema: string, userIds: readonly string[]) => {
  if (userIds.length === 0) return
  const table = sql.raw(`${quoteIdent(schema)}."notices"`)
  await db.transaction().execute(async (trx) => {
    await sql`lock table ${table} in share row exclusive mode`.execute(trx)
    await sql`insert into ${table} ("resource", "record_key", "operation") select ${ringNotice}, u, 'update' from unnest(${users([...new Set(userIds)])}::text[]) as u`.execute(trx)
  })
}
