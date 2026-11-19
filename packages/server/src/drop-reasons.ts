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

// The SQLSTATEs Postgres ends a session with, such as a terminated backend or an idle-transaction timeout; a statement
// in flight then fails with that error before the client reports the drop. Read by code, which Postgres never
// translates, unlike the severity.
const sessionEnding = new Set([
  '57P01', // admin_shutdown, also pg_terminate_backend
  '57P02', // crash_shutdown
  '57P04', // database_dropped
  '57P05', // idle_session_timeout
  '25P03', // idle_in_transaction_session_timeout
  '25P04', // transaction_timeout
])
const sqlState = (error: unknown) => (error instanceof Error ? (error as { code?: unknown }).code : undefined)
const endsSession = (error: unknown) => sessionEnding.has(sqlState(error) as string)
// pg's DatabaseError, the server's answer to the statement, carries a severity; the client's own failures do not.
const reportedByServer = (error: unknown) => error instanceof Error && typeof (error as { severity?: unknown }).severity === 'string'

const failure = (client: PgClient, error: unknown) => {
  if (endsSession(error)) {
    if (!reasons.has(client)) reasons.set(client, error as Error)
    return new LostConnection(reasons.get(client)!)
  }
  // The statement's own error, such as a unique violation, even when the drop came right after it.
  if (reportedByServer(error)) return error
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
