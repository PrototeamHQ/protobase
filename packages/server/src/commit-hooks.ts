import type { DatabaseConnection } from 'kysely'
import type { Db } from '@protobase/query'

// The work waiting for each open transaction of the app's driver to commit. Only a connection whose transaction the
// driver began has an entry, and its commit or rollback takes it, so nothing is kept past the transaction.
const waiting = new WeakMap<DatabaseConnection, Array<() => void>>()

/** Called by the app's driver as it begins a transaction on `connection`: work can then wait for its commit. */
export const openCommitHooks = (connection: DatabaseConnection) => {
  waiting.set(connection, [])
}

/** Called by the app's driver as the transaction on `connection` commits or rolls back: the work that waited for it. */
export const takeCommitHooks = (connection: DatabaseConnection) => {
  const hooks = waiting.get(connection) ?? []
  waiting.delete(connection)
  return hooks
}

/**
 * Runs `run` right after the transaction `trx` commits, and never when it rolls back. `run` must not throw. Returns
 * whether it will: only a transaction of the app's driver (`appDialect`) runs it, so on another driver it returns false.
 */
export const afterCommit = async (trx: Db, run: () => void) => {
  if (!trx.isTransaction) throw new Error('afterCommit needs a transaction')
  const connection = await trx.getExecutor().provideConnection(async (held) => held)
  const hooks = waiting.get(connection)
  if (!hooks) return false
  hooks.push(run)
  return true
}
