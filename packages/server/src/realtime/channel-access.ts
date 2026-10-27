import { randomUUID } from 'node:crypto'
import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { Caller } from '../api-keys/resolve-caller'
import { isDatabaseError } from '../error-handler'
import { callerSettings } from '../rest/caller-settings'
import { writeTransaction } from '../transactions'

/** What a private channel's policies govern, as Supabase Realtime names it in `realtime.messages.extension`. */
export type Extension = 'broadcast' | 'presence'

export type ChannelAccessOptions = {
  db: Db
  statementTimeoutMs: number
}

// SQLSTATE 42501: the row security policies refused the insert.
const insufficientPrivilege = '42501'

/**
 * Supabase Realtime Authorization: the row security policies on `realtime.messages` decide what a caller may do on a
 * private channel's topic, as Supabase's Realtime checks them. Each check runs in a transaction of its own, under a
 * savepoint it rolls back, so nothing it inserts stays. It sets the caller's role and claims as `/api/sb/rest/v1` does,
 * and the topic, without its `realtime:` prefix, in `realtime.topic`, which `realtime.topic()` reads. A database
 * without `realtime.messages` allows nothing.
 */
export const channelAccess = ({ db, statementTimeoutMs }: ChannelAccessOptions) => {
  const probe = <T>(denied: T, run: (trx: Db) => Promise<T>) =>
    writeTransaction(db, statementTimeoutMs, async (trx) => {
      const { rows } = await sql<{ found: boolean }>`select to_regclass('realtime.messages') is not null as found`.execute(trx)
      if (!rows[0]!.found) return denied
      await sql`savepoint access_probe`.execute(trx)
      const result = await run(trx)
      await sql`rollback to savepoint access_probe`.execute(trx)
      return result
    })

  const actAs = (trx: Db, caller: Caller, topic: string) => {
    // The app's role sets none: `none` goes back to the connection's own, and an empty user to none.
    const settings = { role: 'none', 'request.jwt.claim.sub': '', ...callerSettings(caller), 'realtime.topic': topic }
    return sql`select ${sql.join(Object.entries(settings).map(([name, value]) => sql`set_config(${name}, ${value}, true)`))}`.execute(trx)
  }

  return {
    /**
     * Whether the caller may receive each extension's messages on the topic: as the connection's own role, which must
     * own `realtime.messages` or bypass its policies, it inserts a message of each, then selects them as the caller.
     */
    read: (caller: Caller, topic: string, extensions: readonly Extension[]) =>
      probe(new Map<Extension, boolean>(), async (trx) => {
        const probes = extensions.map((extension) => ({ id: randomUUID(), extension }))
        await sql`insert into realtime.messages (id, topic, extension, private)
          select id, ${topic}, extension, true from jsonb_to_recordset(${JSON.stringify(probes)}::jsonb) as p(id uuid, extension text)`.execute(trx)
        await actAs(trx, caller, topic)
        const { rows } = await sql<{ id: string }>`select id::text as id from realtime.messages where id = any(${probes.map((probe) => probe.id)}::uuid[])`.execute(trx)
        const seen = new Set(rows.map((row) => row.id))
        return new Map(probes.map((probe) => [probe.extension, seen.has(probe.id)]))
      }),
    /** Whether the caller may send the extension's messages on the topic: whether it may insert one. */
    write: (caller: Caller, topic: string, extension: Extension) =>
      probe(false, async (trx) => {
        await actAs(trx, caller, topic)
        return sql`insert into realtime.messages (topic, extension, private) values (${topic}, ${extension}, true)`.execute(trx).then(
          () => true,
          (error: unknown) => {
            if (isDatabaseError(error) && error.code === insufficientPrivilege) return false
            throw error
          },
        )
      }),
  }
}

export type ChannelAccess = ReturnType<typeof channelAccess>
