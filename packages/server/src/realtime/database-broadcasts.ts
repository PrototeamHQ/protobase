import { Buffer } from 'node:buffer'
import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { writeTransaction } from '../transactions'
import { fitsFrame } from './broadcast-frame'
import type { BroadcastHub, Publication } from './broadcast-hub'
import { realtimeLimits } from './realtime-limits'

export type DatabaseBroadcastsOptions = {
  db: Db
  statementTimeoutMs: number
  broadcasts: BroadcastHub
  /** How often `realtime.messages` is read while a socket is open. */
  intervalMs?: number
  /** Where a failed read goes; the next one tries again. */
  report: (error: unknown) => void
}

/** A broadcast row of `realtime.messages`; Supabase skips one without a topic, event, payload or `private`. */
export type MessageRow = { id: string; topic: string | null; event: string | null; payload: unknown; private: boolean | null }

/** Messages taken in one transaction at most. */
const batchSize = 1000

/**
 * The message as the channels joined on its topic hear it, with its id as `meta`, as Supabase sends it; `undefined` for
 * one Supabase would skip, or whose topic or event does not fit a frame or whose payload is over a frame.
 */
export const publicationOfRow = (row: MessageRow): Publication | undefined => {
  if (row.topic === null || row.event === null || row.payload === null || row.private === null) return undefined
  const topic = `realtime:${row.topic}`
  if (!fitsFrame(topic) || !fitsFrame(row.event)) return undefined
  if (Buffer.byteLength(JSON.stringify(row.payload)) > realtimeLimits.maxFrameBytes) return undefined
  return { topic, event: row.event, payload: row.payload, private: row.private, meta: { id: row.id } }
}

// The oldest committed broadcasts, taken out of the table in the order they were sent; rows another reader holds are
// left to it.
const takeMessages = (db: Db, statementTimeoutMs: number) =>
  writeTransaction(db, statementTimeoutMs, async (trx) => {
    const { rows } = await sql<MessageRow>`with taken as (
        delete from realtime.messages where id in (
          select id from realtime.messages where extension = 'broadcast' order by inserted_at limit ${batchSize} for update skip locked
        ) returning id, topic, event, payload, private, inserted_at
      )
      select id::text as id, topic, event, payload, private from taken order by inserted_at`.execute(trx)
    return rows
  })

const tableExists = async (db: Db) =>
  (await sql<{ found: boolean }>`select to_regclass('realtime.messages') is not null as found`.execute(db)).rows[0]!.found

/**
 * Supabase's broadcast from the database: `realtime.send()` and `realtime.broadcast_changes()` insert a message into
 * `realtime.messages` in the caller's transaction, so only a committed one is seen, and while a socket of this process
 * is open the table is read every `intervalMs`, its messages taken out of it and sent to the channels joined on their
 * topics, the private or the public ones, under the topic's broadcast rate. A message nobody hears is dropped, as on
 * Supabase: the first read when a socket opens takes those sent while none was. A database without
 * `realtime.messages` sends nothing, and is checked again at each read.
 */
export const databaseBroadcasts = ({ db, statementTimeoutMs, broadcasts, intervalMs = 1000, report }: DatabaseBroadcastsOptions) => {
  let followers = 0
  let running = false

  const read = async () => {
    if (!(await tableExists(db))) return
    for (;;) {
      const rows = await takeMessages(db, statementTimeoutMs)
      for (const row of rows) {
        const publication = publicationOfRow(row)
        if (publication) await broadcasts.publish([publication])
      }
      if (rows.length < batchSize) return
    }
  }

  const tick = async () => {
    if (followers === 0) {
      running = false
      return
    }
    await read().catch(report)
    setTimeout(() => void tick(), intervalMs)
  }

  return {
    /** Reads the table from now on, until the returned function is called; once for each call, however often. */
    follow: () => {
      followers += 1
      if (!running) {
        running = true
        void tick()
      }
      let followed = true
      return () => {
        if (!followed) return
        followed = false
        followers -= 1
      }
    },
  }
}

export type DatabaseBroadcasts = ReturnType<typeof databaseBroadcasts>
