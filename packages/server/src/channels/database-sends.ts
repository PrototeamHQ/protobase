import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { HttpProblem } from '../problem'
import type { BroadcastHub, Publication } from '../realtime/broadcast-hub'
import { followedPoll } from '../realtime/followed-poll'
import type { Registry } from '../registry'
import { writeTransaction } from '../transactions'
import { broadcastRecord, publicationTo } from './channel-sender'
import { sendsSchema } from './sends-schema-sql'

export type DatabaseSendsOptions = {
  db: Db
  statementTimeoutMs: number
  registry: Pick<Registry, 'find'>
  /** The record channels' broadcasts, which with several processes the relay carries to the others. */
  broadcasts: BroadcastHub
  /** How often `channels.sends` is read while a socket is open. */
  intervalMs?: number
  /** Where a failed read goes; the next one tries again. */
  report: (error: unknown) => void
}

/** A row of `channels.sends`. */
export type SendRow = { id: string; resource: string; key: string; event: string; payload: unknown }

/** Sends taken in one transaction at most. */
const batchSize = 1000

/**
 * The broadcast a row sends, as the server, under the checks of `channels.broadcast` in API functions; `undefined` for
 * one they refuse, such as for a record the app does not have or a payload over a frame, which is dropped.
 */
export const publicationOfSend = (registry: Pick<Registry, 'find'>, row: SendRow): Publication | undefined => {
  try {
    const record = broadcastRecord(registry, row)
    return publicationTo(record, row.event, { user: null, server: true, payload: row.payload })
  } catch (error) {
    if (error instanceof HttpProblem) return
    throw error
  }
}

// The oldest committed sends, taken out of the table in the order they were sent; rows another reader holds are left
// to it.
const takeSends = (db: Db, statementTimeoutMs: number) =>
  writeTransaction(db, statementTimeoutMs, async (trx) => {
    const { rows } = await sql<SendRow>`with taken as (
        delete from ${sql.id(sendsSchema, 'sends')} where id in (
          select id from ${sql.id(sendsSchema, 'sends')} order by id limit ${batchSize} for update skip locked
        ) returning id, resource, key, event, payload
      )
      select id::text as id, resource, key, event, payload from taken order by id`.execute(trx)
    return rows
  })

/**
 * SQL's broadcasts to the record channels: `channels.send()` inserts a row in the caller's transaction, so only a
 * committed one is seen, and while a record channel's socket of this process is open the table is read every
 * `intervalMs`, its rows taken out of it and sent to the channels of their records, as the server, under the channel's
 * broadcast rate. A send nobody hears is dropped, as is one the checks refuse. With several processes, one takes a row
 * and the relay carries it to the others.
 */
export const databaseSends = ({ db, statementTimeoutMs, registry, broadcasts, intervalMs = 1000, report }: DatabaseSendsOptions) => {
  const read = async () => {
    for (;;) {
      const rows = await takeSends(db, statementTimeoutMs)
      for (const row of rows) {
        const publication = publicationOfSend(registry, row)
        if (publication) await broadcasts.publish([publication])
      }
      if (rows.length < batchSize) return
    }
  }
  return followedPoll(read, intervalMs, report)
}
