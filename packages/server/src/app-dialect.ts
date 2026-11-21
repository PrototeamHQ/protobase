import { PostgresDialect, PostgresDriver, type DatabaseConnection, type PostgresDialectConfig, type PostgresPool, type TransactionSettings } from 'kysely'
import { openCommitHooks, takeCommitHooks } from './commit-hooks'
import { keepDropReasons } from './drop-reasons'
import { LostConnection } from './lost-connection'

// Postgres rolls back the open transaction of a session that ended, so a rollback on a connection that dropped has
// nothing left to do, and the transaction fails with its own error, which names why, rather than the rollback's. Once a
// commit was sent, the drop leaves its outcome unknown, so the rollback fails with the lost connection instead.
// The work that waits for a transaction's commit (`afterCommit`) runs once it committed, and is dropped when it rolls
// back or its commit fails.
class AppDriver extends PostgresDriver {
  readonly #committing = new WeakSet<DatabaseConnection>()

  override async beginTransaction(connection: DatabaseConnection, settings: TransactionSettings) {
    this.#committing.delete(connection)
    await super.beginTransaction(connection, settings)
    openCommitHooks(connection)
  }

  override async commitTransaction(connection: DatabaseConnection) {
    this.#committing.add(connection)
    const hooks = takeCommitHooks(connection)
    await super.commitTransaction(connection)
    for (const hook of hooks) hook()
  }

  override async rollbackTransaction(connection: DatabaseConnection) {
    takeCommitHooks(connection)
    try {
      await super.rollbackTransaction(connection)
    } catch (error) {
      if (error instanceof LostConnection && !this.#committing.has(connection)) return
      throw error
    }
  }
}

class AppDialect extends PostgresDialect {
  readonly #config: PostgresDialectConfig

  constructor(config: PostgresDialectConfig) {
    super(config)
    this.#config = config
  }

  override createDriver() {
    return new AppDriver(this.#config)
  }
}

/**
 * Kysely's Postgres dialect over the app's pool: a statement on a connection that dropped fails with `LostConnection`,
 * which names why it dropped, and so does a transaction on it. Its transactions run what `afterCommit` gave them once
 * they commit.
 */
export const appDialect = (pool: PostgresPool) => new AppDialect({ pool: keepDropReasons(pool) })
