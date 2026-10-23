import type { PostgresPoolClient } from 'kysely'

// SQLSTATE 08P01, as PgBouncer refuses a startup parameter it does not track, such as statement_timeout.
const refusedAtLogin = (error: unknown) => error instanceof Error && (error as unknown as { code?: unknown }).code === '08P01'

/**
 * The long-query pool's `connect`: a pooler that refuses the `statement_timeout` it logs in with is an error that says
 * what the pooler lacks, rather than the protocol error it answers with.
 */
export const connectLong = (pool: { connect(): Promise<PostgresPoolClient> }) => async () => {
  try {
    return await pool.connect()
  } catch (error) {
    if (!refusedAtLogin(error)) throw error
    throw new Error('The database refused statement_timeout at login, which longQueries needs: a PgBouncer in front of it must list statement_timeout in track_extra_parameters', { cause: error })
  }
}
