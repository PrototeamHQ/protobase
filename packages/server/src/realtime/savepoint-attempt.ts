import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { isDatabaseError } from '../error-handler'

// The SQLSTATE classes that say nothing of the statement itself: a lost connection, a transaction state, a rollback,
// exhausted resources, an operator's intervention such as a statement timeout or a terminated backend, a system or
// an internal error. The transaction or connection cannot be trusted to go on after them.
const transient = new Set(['08', '25', '40', '53', '57', '58', 'XX'])

/** Whether Postgres refused the statement itself, such as a value its column's type does not take. */
export const isStatementError = (error: unknown) => isDatabaseError(error) && !transient.has(error.code.slice(0, 2))

export type Attempt<T> = { ok: true; value: T } | { ok: false; error: unknown }

/**
 * Runs `run` inside the savepoint `name` of `trx`: when Postgres refuses one of its statements, the transaction goes
 * back to the savepoint, keeping the settings made before it, and the error is returned. Any other error is thrown.
 */
export const attempt = async <T>(trx: Db, name: string, run: () => Promise<T>): Promise<Attempt<T>> => {
  await sql`savepoint ${sql.id(name)}`.execute(trx)
  try {
    const value = await run()
    await sql`release savepoint ${sql.id(name)}`.execute(trx)
    return { ok: true, value }
  } catch (error) {
    if (!isStatementError(error)) throw error
    await sql`rollback to savepoint ${sql.id(name)}`.execute(trx)
    await sql`release savepoint ${sql.id(name)}`.execute(trx)
    return { ok: false, error }
  }
}
