import { sql } from 'kysely'
import type { Db } from '@protobase/query'

/** A member's description or candidate for a member another process serves, addressed to that process. */
export type StoredSignal = { id: string; process: string; call: string; to: string; from: string; body: unknown }

export const writeSignal = async (db: Db, signal: Omit<StoredSignal, 'id'>) => {
  await sql`insert into "calls"."signals" ("process", "call_id", "to_member", "from_member", "body", "at")
    values (${signal.process}::uuid, ${signal.call}::uuid, ${signal.to}, ${signal.from}, ${JSON.stringify(signal.body)}::json, now())`.execute(db)
}

/**
 * Takes the signals for `process` out of the table, at most `limit`, in the order they were written: each process
 * reads only its own, so ids that commit out of order across processes are never skipped. A sender's signals are
 * written one after the other, so they come in their order.
 */
export const takeSignals = async (db: Db, process: string, limit: number) => {
  const { rows } = await sql<StoredSignal>`delete from "calls"."signals" where "id" in (
      select "id" from "calls"."signals" where "process" = ${process}::uuid order by "id" limit ${limit} for update skip locked)
    returning "id"::text as id, "process"::text as process, "call_id"::text as call, "to_member" as to, "from_member" as from, "body"`.execute(db)
  return rows.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
}
