import { PostgresDialect, PostgresDriver, type DatabaseConnection, type PostgresDialectConfig, type PostgresPool } from 'kysely'
import { keepDropReasons } from './drop-reasons'
import { LostConnection } from './lost-connection'

// Postgres rolls back the open transaction of a session that ended, so a rollback on a connection that dropped has
// nothing left to do, and the transaction fails with its own error, which names why, rather than the rollback's.
class AppDriver extends PostgresDriver {
  override async rollbackTransaction(connection: DatabaseConnection) {
    try {
      await super.rollbackTransaction(connection)
    } catch (error) {
      if (error instanceof LostConnection) return
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
 * which names why it dropped, and so does a transaction on it.
 */
export const appDialect = (pool: PostgresPool) => new AppDialect({ pool: keepDropReasons(pool) })
