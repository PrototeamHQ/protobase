import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { PresenceChange, PresenceDiff, PresenceMeta } from '../presence-hub'

/** A presence a channel tracks, as the relay keeps it. */
export type TrackedPresence = { topic: string; private: boolean; key: string; meta: PresenceMeta }

const stateOf = (key: string, meta: PresenceMeta | undefined) => (meta ? { [key]: { metas: [meta] } } : {})

/** The change as the `presence_diff` the other processes' channels hear. */
export const diffOf = (change: PresenceChange): PresenceDiff => ({ joins: stateOf(change.key, change.joined), leaves: stateOf(change.key, change.left) })

// A frame of one row of `gone` or `added`, which has its process, topic, private, key and meta.
const leaveFrame = sql.raw(`json_build_object('joins', '{}'::json, 'leaves', json_build_object(key, json_build_object('metas', json_build_array(meta))))`)
const joinFrame = sql.raw(`json_build_object('joins', json_build_object(key, json_build_object('metas', json_build_array(meta))), 'leaves', '{}'::json)`)

/**
 * Keeps the change in `presences` and adds its frame, in one statement: a leave alone is sent only when the presence
 * was there, as a process that was taken for stopped had its presences removed already.
 */
export const writePresence = async (db: Db, self: string, change: PresenceChange) => {
  const ref = change.joined?.phx_ref ?? null
  await sql`with gone as (delete from realtime_relay.presences where process = ${self}::uuid and ref = ${change.left?.phx_ref ?? null}::text returning ref),
      added as (insert into realtime_relay.presences (process, ref, topic, private, key, meta)
        select ${self}::uuid, ${ref}::text, ${change.topic}::text, ${change.private}::boolean, ${change.key}::text, ${JSON.stringify(change.joined ?? null)}::json where ${ref}::text is not null)
    insert into realtime_relay.frames (process, kind, topic, private, payload)
    select ${self}::uuid, 'presence', ${change.topic}::text, ${change.private}::boolean, ${JSON.stringify(diffOf(change))}::json
    where ${ref}::text is not null or exists (select from gone)`.execute(db)
}

/** Adds the presences back, with their joins, for a process that was taken for stopped while it was not. */
export const restorePresences = async (db: Db, self: string, tracked: readonly TrackedPresence[]) => {
  if (tracked.length === 0) return
  await sql`with added as (insert into realtime_relay.presences (process, ref, topic, private, key, meta)
        select ${self}::uuid, ref, topic, private, key, meta::json from unnest(${tracked.map((t) => t.meta.phx_ref)}::text[], ${tracked.map((t) => t.topic)}::text[],
          ${tracked.map((t) => t.private)}::boolean[], ${tracked.map((t) => t.key)}::text[], ${tracked.map((t) => JSON.stringify(t.meta))}::text[]) as t(ref, topic, private, key, meta)
        on conflict do nothing returning process, topic, private, key, meta)
    insert into realtime_relay.frames (process, kind, topic, private, payload) select process, 'presence', topic, private, ${joinFrame} from added`.execute(db)
}

/**
 * Marks this process as running, by the database's clock: `true` when its row was not there, as at its start or once
 * another process took it for stopped.
 */
export const beat = async (db: Db, self: string) => {
  const { rows } = await sql<{ inserted: boolean }>`insert into realtime_relay.processes (id) values (${self}::uuid)
    on conflict (id) do update set seen_at = now() returning (xmax = 0) as inserted`.execute(db)
  return rows[0]!.inserted
}

// Removes the processes `dead` names and the presences of processes that are gone, with a leave frame for each, sent
// as from the process that tracked it. A presence is deleted once, however many processes remove at the same time.
const retire = (db: Db, dead: ReturnType<typeof sql>) =>
  sql`with dead as (delete from realtime_relay.processes where ${dead} returning id),
      gone as (delete from realtime_relay.presences p where p.process in (select id from dead) or not exists (select from realtime_relay.processes q where q.id = p.process)
        returning process, topic, private, key, meta)
    insert into realtime_relay.frames (process, kind, topic, private, payload) select process, 'presence', topic, private, ${leaveFrame} from gone`.execute(db)

/** Removes the processes that have not beaten for `staleSeconds`, and their presences. */
export const retireStale = async (db: Db, staleSeconds: number) => {
  await retire(db, sql`seen_at < now() - make_interval(secs => ${staleSeconds})`)
}

/** Removes this process and its presences, as it stops. */
export const retireSelf = async (db: Db, self: string) => {
  await retire(db, sql`id = ${self}::uuid`)
}

/**
 * In one snapshot, the other processes' presences and where their frames stand: the newest id, and every id from the
 * first of the last two seconds on, below which a frame not committed yet is unlikely.
 */
export const presenceSnapshot = (db: Db, statementTimeoutMs: number, self: string) =>
  db.transaction().setIsolationLevel('repeatable read').execute(async (trx) => {
    await sql`select set_config('statement_timeout', ${String(statementTimeoutMs)}, true)`.execute(trx)
    const presences = await sql<TrackedPresence>`select topic, private, key, meta from realtime_relay.presences where process <> ${self}::uuid`.execute(trx)
    const newest = await sql<{ id: string }>`select coalesce(max(id), 0)::text as id from realtime_relay.frames`.execute(trx)
    const recent = await sql<{ id: string }>`select id::text as id from realtime_relay.frames
      where id >= (select min(id) from realtime_relay.frames where at > now() - interval '2 seconds') order by id`.execute(trx)
    return { presences: presences.rows, newest: BigInt(newest.rows[0]!.id), visible: recent.rows.map((row) => BigInt(row.id)) }
  })
