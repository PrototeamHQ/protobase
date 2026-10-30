import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { CallRemoteTrack } from '@protobase/schema/internal'
import { writeTransaction } from '../transactions'
import { admission, type Refusal } from './admission'

/** A record a call is on: its resource and its encoded key. */
export type CallRecord = { resource: string; key: string }

/** How long a member whose process stopped hearing of them stays in the call, waiting for their browser to resume. */
export const graceSeconds = 30

/** Whether `id` can be a call's id, a UUID: anything else is no call. */
export const isCallId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

/** The process of a removal row, of someone removed while not in the call. */
const nobody = '00000000-0000-0000-0000-000000000000'

export type AdmitInput = {
  record: CallRecord
  member: string
  /** The process that serves the member. */
  process: string
  /** The call the browser resumes, with the tracks it sends; a fresh join without. */
  resume?: { call: string; tracks: CallRemoteTrack[] }
  maxMembers: number
  maxMinutes: number
  /** The name the member shows the others: a guest's own, or the one the app gave. */
  name?: string
  /** A guest, who comes only into the call their link is for, by their id; never starts one. */
  guest?: { id: string; call: string }
}

/** The member in the call `call`, as the members row `row`, with whether their join started it; or why not. */
export type Admission = { call: string; row: string; started: boolean } | { refused: Refusal }

/** Whether a guest may be in their call now, read in the transaction that holds the call's row. */
export type GuestCheck = (trx: Db, guest: string) => Promise<boolean>

// Every change to a call and its members first locks the call's row, so admissions, leaves, removals and its end come
// one after the other: no check of the room or of a removal is ever stale when its write comes.
export const lockCall = async (trx: Db, id: string) =>
  (await sql<{ id: string; resource: string; record_key: string; ended: boolean; expired: boolean }>`select "id"::text as id, "resource", "record_key", "ended_at" is not null as ended, "ends_at" <= now() as expired
    from "calls"."calls" where "id" = ${id}::uuid for update`.execute(trx)).rows[0]

/** Ends the call and the time of everyone still in it; the call's row is locked. */
export const endCall = async (trx: Db, id: string) => {
  await sql`update "calls"."calls" set "ended_at" = now() where "id" = ${id}::uuid and "ended_at" is null`.execute(trx)
  await sql`update "calls"."members" set "left_at" = now() where "call_id" = ${id}::uuid and "left_at" is null`.execute(trx)
}

export const endIfEmpty = async (trx: Db, id: string) => {
  const { rows } = await sql<{ id: string }>`select "id" from "calls"."members" where "call_id" = ${id}::uuid and "left_at" is null limit 1`.execute(trx)
  if (rows.length === 0) await endCall(trx, id)
}

// The record's call going on, started when there is none; one past its end is ended first and another started.
const liveCall = async (trx: Db, record: CallRecord, member: string, maxMinutes: number) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const inserted = await sql<{ id: string }>`insert into "calls"."calls" ("id", "resource", "record_key", "started_by", "started_at", "ends_at")
      values (gen_random_uuid(), ${record.resource}, ${record.key}, ${member}, now(), now() + make_interval(mins => ${maxMinutes}))
      on conflict ("resource", "record_key") where "ended_at" is null do nothing returning "id"::text as id`.execute(trx)
    const { rows } = await sql<{ id: string }>`select "id"::text as id from "calls"."calls"
      where "resource" = ${record.resource} and "record_key" = ${record.key} and "ended_at" is null`.execute(trx)
    const call = rows[0] && (await lockCall(trx, rows[0].id))
    if (call && !call.ended && !call.expired) return { id: call.id, started: inserted.rows[0]?.id === call.id }
    if (call && !call.ended) await endCall(trx, call.id)
  }
  throw new Error(`The call on ${record.resource} ${record.key} could not be started`)
}

// The members row of someone in the call: theirs taken over, now served by `process`, or a new one.
const enter = async (trx: Db, call: string, member: string, process: string, tracks: CallRemoteTrack[], name: string | null) => {
  const body = JSON.stringify(tracks)
  const { rows } = await sql<{ id: string }>`update "calls"."members" set "process" = ${process}::uuid, "seen_at" = now(), "tracks" = ${body}::jsonb, "name" = ${name}
    where "call_id" = ${call}::uuid and "member" = ${member} and "left_at" is null returning "id"::text as id`.execute(trx)
  if (rows[0]) return rows[0].id
  const inserted = await sql<{ id: string }>`insert into "calls"."members" ("call_id", "member", "process", "tracks", "joined_at", "seen_at", "name")
    values (${call}::uuid, ${member}, ${process}::uuid, ${body}::jsonb, now(), now(), ${name}) returning "id"::text as id`.execute(trx)
  return inserted.rows[0]!.id
}

// The call `call` of the browser's resume, locked, while it goes on and is on the record; refused as ended otherwise.
const resumed = async (trx: Db, record: CallRecord, call: string) => {
  const found = isCallId(call) ? await lockCall(trx, call) : undefined
  if (!found || found.ended || found.resource !== record.resource || found.record_key !== record.key) return
  if (!found.expired) return found.id
  await endCall(trx, found.id)
  return
}

/**
 * Lets the member into the record's call, or the call they resume, when they may: one transaction, the call's row
 * locked. The members whose process stopped hearing of them are out first. A resume of a call that ended, or that is
 * on another record, is refused as ended; a fresh join to a record without a call going on starts one. A guest comes
 * only into their link's call, while `guestAllowed` lets them, and never starts one.
 */
export const admit = (db: Db, timeoutMs: number, input: AdmitInput, guestAllowed?: GuestCheck) =>
  writeTransaction(db, timeoutMs, async (trx): Promise<Admission> => {
    const { record, member, resume, guest } = input
    let call: string
    let started = false
    if (guest) {
      if (resume && resume.call !== guest.call) return { refused: 'ended' }
      const going = await resumed(trx, record, guest.call)
      if (!going || !guestAllowed || !(await guestAllowed(trx, guest.id))) return { refused: 'ended' }
      call = going
    } else if (resume) {
      const going = await resumed(trx, record, resume.call)
      if (!going) return { refused: 'ended' }
      call = going
    } else {
      const live = await liveCall(trx, record, member, input.maxMinutes)
      call = live.id
      started = live.started
    }
    await sql`update "calls"."members" set "left_at" = now()
      where "call_id" = ${call}::uuid and "left_at" is null and "seen_at" < now() - make_interval(secs => ${graceSeconds})`.execute(trx)
    const { rows } = await sql<{ member: string; present: boolean }>`select "member", "left_at" is null as present from "calls"."members"
      where "call_id" = ${call}::uuid and ("left_at" is null or ("member" = ${member} and "removed_at" is not null))`.execute(trx)
    const refused = admission({
      removed: rows.some((row) => row.member === member && !row.present),
      present: rows.filter((row) => row.present).map((row) => row.member),
      member,
      maxMembers: input.maxMembers,
    })
    if (refused) return { refused }
    return { call, row: await enter(trx, call, member, input.process, resume?.tracks ?? [], input.name ?? null), started }
  })

/** The member of row `row` left, unless another process took them over; the call ends with its last member. */
export const leave = (db: Db, timeoutMs: number, row: string, process: string) =>
  writeTransaction(db, timeoutMs, async (trx) => {
    const { rows } = await sql<{ call: string }>`select "call_id"::text as call from "calls"."members" where "id" = ${row}::bigint`.execute(trx)
    if (!rows[0]) return
    const call = await lockCall(trx, rows[0].call)
    if (!call || call.ended) return
    await sql`update "calls"."members" set "left_at" = now() where "id" = ${row}::bigint and "process" = ${process}::uuid and "left_at" is null`.execute(trx)
    await endIfEmpty(trx, call.id)
  })

/**
 * Removes the member from the call `call`, and only from it: their time in it ends as removed, or, when they are not in
 * it, a removal is kept, so a join of theirs on its way is refused. Nothing happens to a call that ended or is unknown.
 * Whether they were in it. The call ends when they were its last member.
 */
export const remove = (db: Db, timeoutMs: number, callId: string, member: string) =>
  writeTransaction(db, timeoutMs, async (trx) => {
    const call = isCallId(callId) ? await lockCall(trx, callId) : undefined
    if (!call || call.ended) return false
    if (!(await removeMember(trx, call.id, member))) return false
    await endIfEmpty(trx, call.id)
    return true
  })

/** `remove`'s change, in a transaction that holds the call's row: whether the member was in the call. */
export const removeMember = async (trx: Db, call: string, member: string) => {
  const { rows } = await sql<{ id: string }>`update "calls"."members" set "left_at" = now(), "removed_at" = now()
    where "call_id" = ${call}::uuid and "member" = ${member} and "left_at" is null returning "id"::text as id`.execute(trx)
  if (rows.length > 0) return true
  await sql`insert into "calls"."members" ("call_id", "member", "process", "tracks", "joined_at", "seen_at", "left_at", "removed_at")
    values (${call}::uuid, ${member}, ${nobody}::uuid, '[]'::jsonb, now(), now(), now(), now())`.execute(trx)
  return false
}

/** The tracks the member of row `row` sends now, while `process` serves them. */
export const setTracks = async (db: Db, row: string, process: string, tracks: CallRemoteTrack[]) => {
  await sql`update "calls"."members" set "tracks" = ${JSON.stringify(tracks)}::jsonb
    where "id" = ${row}::bigint and "process" = ${process}::uuid and "left_at" is null`.execute(db)
}

/** The process still hears of the members of these rows: they stay in their calls. */
export const heartbeat = async (db: Db, process: string, rows: readonly string[]) => {
  if (rows.length === 0) return
  await sql`update "calls"."members" set "seen_at" = now()
    where "id" = any(${`{${rows.join(',')}}`}::bigint[]) and "process" = ${process}::uuid and "left_at" is null`.execute(db)
}

/** The record the call is on; `undefined` for an unknown call. */
export const callRecord = async (db: Db, call: string): Promise<CallRecord | undefined> => {
  if (!isCallId(call)) return
  const { rows } = await sql<CallRecord>`select "resource", "record_key" as key from "calls"."calls" where "id" = ${call}::uuid`.execute(db)
  return rows[0]
}
