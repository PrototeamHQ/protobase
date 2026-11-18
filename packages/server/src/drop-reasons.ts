import type { PostgresPool, PostgresPoolClient } from 'kysely'
import { LostConnection } from './lost-connection'

type PgClient = PostgresPoolClient & { on(event: 'error', listener: (error: Error) => void): unknown; release(error?: Error): void }

// The first error each client reports, which says why its connection dropped; later ones, such as pg's
// "Connection terminated unexpectedly" after a terminated session, only follow from it.
const reasons = new WeakMap<object, Error>()
const listening = new WeakSet<object>()

const listen = (client: PgClient) => {
  if (listening.has(client)) return
  listening.add(client)
  client.on('error', (error) => {
    if (!reasons.has(client)) reasons.set(client, error)
  })
}

// Postgres ends the session with a FATAL error, such as a terminated backend or an idle-transaction timeout, and a
// statement in flight then fails with that error before the client reports the drop.
const endsSession = (error: unknown) => error instanceof Error && (error as { severity?: unknown }).severity === 'FATAL'

const failure = (client: PgClient, error: unknown) => {
  if (!reasons.has(client) && endsSession(error)) reasons.set(client, error as Error)
  const reason = reasons.get(client)
  return reason ? new LostConnection(reason) : error
}

// One per checkout, since whoever takes the client may replace its `release`.
const keepingReason = (client: PgClient): PostgresPoolClient => ({
  processID: client.processID,
  query: ((sql: unknown, parameters?: ReadonlyArray<unknown>) => {
    // A cursor, which Kysely streams with, reports its own failures.
    if (typeof sql !== 'string') return client.query(sql as never)
    return client.query(sql, parameters ?? []).catch((error: unknown) => {
      throw failure(client, error)
    })
  }) as PostgresPoolClient['query'],
  // A client whose connection dropped goes back as broken, so the pool closes it rather than hand it out again.
  release: () => client.release(reasons.get(client)),
})

/**
 * `pool`, where a statement on a connection that dropped fails with `LostConnection`, which names why it dropped,
 * rather than pg's "Client has encountered a connection error and is not queryable".
 */
export const keepDropReasons = (pool: PostgresPool): PostgresPool => ({
  ...(pool.Client && { Client: pool.Client }),
  options: pool.options,
  connect: async () => {
    const client = (await pool.connect()) as PgClient
    listen(client)
    return keepingReason(client)
  },
  end: () => pool.end(),
})
