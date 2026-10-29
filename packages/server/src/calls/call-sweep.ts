import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { writeTransaction } from '../transactions'
import { endCall, graceSeconds, type CallRecord } from './call-store'

/** How long a signal between processes is kept: long after it was read. */
const signalSeconds = 60

/**
 * Ends what should have ended, over every call, whichever process served it: the members no process heard of within
 * `graceSeconds`, as after their socket was lost or their process stopped; the calls past their last minute; the
 * calls nobody is in any more. A call an admission holds is left to the next sweep. Old signals go too. The records
 * whose calls it changed.
 */
export const sweepCalls = (db: Db, timeoutMs: number) =>
  writeTransaction(db, timeoutMs, async (trx): Promise<CallRecord[]> => {
    const left = await sql<{ id: string }>`update "calls"."members" set "left_at" = now()
      where "left_at" is null and "seen_at" < now() - make_interval(secs => ${graceSeconds}) returning "call_id"::text as id`.execute(trx)
    const changed = new Set(left.rows.map((row) => row.id))
    // Locked first, then checked again by a statement of its own, which sees what the admissions before it committed.
    const { rows } = await sql<{ id: string }>`select "id"::text as id from "calls"."calls" c where "ended_at" is null
      and ("ends_at" <= now() or not exists (select from "calls"."members" m where m."call_id" = c."id" and m."left_at" is null))
      for update skip locked`.execute(trx)
    if (rows.length > 0) {
      const ended = await sql<{ id: string }>`select "id"::text as id from "calls"."calls" c where "id" = any(${`{${rows.map((row) => row.id).join(',')}}`}::uuid[])
        and ("ends_at" <= now() or not exists (select from "calls"."members" m where m."call_id" = c."id" and m."left_at" is null))`.execute(trx)
      for (const { id } of ended.rows) {
        await endCall(trx, id)
        changed.add(id)
      }
    }
    await sql`delete from "calls"."signals" where "at" < now() - make_interval(secs => ${signalSeconds})`.execute(trx)
    if (changed.size === 0) return []
    const records = await sql<{ resource: string; key: string }>`select distinct "resource", "record_key" as key from "calls"."calls" where "id" = any(${`{${[...changed].join(',')}}`}::uuid[])`.execute(trx)
    return records.rows
  })
