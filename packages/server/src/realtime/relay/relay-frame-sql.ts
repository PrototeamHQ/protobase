import { Buffer } from 'node:buffer'
import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { writeTransaction } from '../../transactions'
import type { Publication } from '../broadcast-hub'
import type { PresenceDiff } from '../presence-hub'
import { realtimeLimits } from '../realtime-limits'
import type { RelaySpace } from './relay-schema-sql'

/** What another process sent: a broadcast, or the joins and leaves of its channels' presences. */
export type RelayedFrame = { id: bigint; space: RelaySpace } & ({ kind: 'broadcast'; publication: Publication } | { kind: 'presence'; topic: string; private: boolean; diff: PresenceDiff })

type FrameRow = { id: string; own: boolean; kind: 'broadcast' | 'presence'; space: RelaySpace; topic: string; private: boolean; event: string | null; payload: unknown; bytes: Buffer | null; meta: { id: string } | null }

/** Frames read in one query at most. */
export const frameBatch = 1000

class Refused extends Error {}

const bytesOf = (payload: unknown) => (payload instanceof ArrayBuffer ? Buffer.from(payload).toString('base64') : null)
const jsonOf = (payload: unknown) => (payload instanceof ArrayBuffer ? null : (JSON.stringify(payload) ?? null))

/**
 * Counts the broadcasts into each topic's second, every process's together, and adds them as frames, all of them or,
 * when a topic would take more than its broadcasts for this second, none: `false` then.
 */
export const admitBroadcasts = async (db: Db, statementTimeoutMs: number, self: string, space: RelaySpace, publications: readonly Publication[]) => {
  if (publications.length === 0) return true
  const takes = new Map<string, number>()
  for (const { topic } of publications) takes.set(topic, (takes.get(topic) ?? 0) + 1)
  const admit = writeTransaction(db, statementTimeoutMs, async (trx) => {
    const { rows } = await sql<{ topic: string }>`insert into realtime_relay.rates as r (topic, second, count)
        select topic, extract(epoch from now())::bigint, n from unnest(${[...takes.keys()]}::text[], ${[...takes.values()]}::int[]) as t(topic, n)
        where n <= ${realtimeLimits.topicBroadcastsPerSecond}
      on conflict (topic) do update set second = excluded.second, count = case when r.second = excluded.second then r.count + excluded.count else excluded.count end
        where r.second <> excluded.second or r.count + excluded.count <= ${realtimeLimits.topicBroadcastsPerSecond}
      returning topic`.execute(trx)
    // Rolls back the counts of the topics that fit.
    if (rows.length < takes.size) throw new Refused()
    await sql`insert into realtime_relay.frames (process, kind, space, topic, private, event, payload, bytes, meta)
      select ${self}::uuid, 'broadcast', ${space}::text, topic, private, event, payload::json, decode(bytes, 'base64'), meta::json
      from unnest(${publications.map((p) => p.topic)}::text[], ${publications.map((p) => p.private)}::boolean[], ${publications.map((p) => p.event)}::text[],
        ${publications.map((p) => jsonOf(p.payload))}::text[], ${publications.map((p) => bytesOf(p.payload))}::text[], ${publications.map((p) => (p.meta ? JSON.stringify(p.meta) : null))}::text[])
        with ordinality as f(topic, private, event, payload, bytes, meta, position)
      order by position`.execute(trx)
    return true
  })
  return admit.catch((error: unknown) => {
    if (error instanceof Refused) return false
    throw error
  })
}

const frameOf = (row: FrameRow): RelayedFrame => {
  const id = BigInt(row.id)
  const { space } = row
  if (row.kind === 'presence') return { id, space, kind: 'presence', topic: row.topic, private: row.private, diff: row.payload as PresenceDiff }
  const payload = row.bytes ? new Uint8Array(row.bytes).buffer : row.payload
  return { id, space, kind: 'broadcast', publication: { topic: row.topic, event: row.event!, payload, private: row.private, ...(row.meta && { meta: row.meta }) } }
}

/**
 * At most `frameBatch` frames after `after` or among `gaps`, in order: the ids of all of them, to move on from, and the
 * other processes' frames, to deliver.
 */
export const readFrames = async (db: Db, self: string, after: bigint, gaps: readonly bigint[]) => {
  const { rows } = await sql<FrameRow>`select id::text as id, process = ${self}::uuid as own, kind, space, topic, private, event,
      case when process <> ${self}::uuid then payload end as payload, case when process <> ${self}::uuid then bytes end as bytes, meta
    from realtime_relay.frames where id > ${String(after)}::bigint or id = any(${gaps.map(String)}::bigint[])
    order by id limit ${frameBatch}`.execute(db)
  return { ids: rows.map((row) => BigInt(row.id)), frames: rows.filter((row) => !row.own).map(frameOf), full: rows.length === frameBatch }
}

/** Deletes the frames older than a minute and the counts of seconds before it. */
export const pruneFrames = async (db: Db) => {
  await sql`delete from realtime_relay.frames where at < now() - interval '1 minute'`.execute(db)
  await sql`delete from realtime_relay.rates where second < extract(epoch from now())::bigint - 60`.execute(db)
}
