import {
  PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler,
  type DatabaseConnection, type Dialect, type Driver, type QueryResult,
} from 'kysely'
import type { ReservedSql, Sql } from 'postgres'

/** Minimal Kysely dialect over postgres.js, enough to run the query layer against the real database. */
class PostgresJsConnection implements DatabaseConnection {
  constructor(readonly reserved: ReservedSql) {}

  async executeQuery<R>(compiled: { sql: string; parameters: readonly unknown[] }): Promise<QueryResult<R>> {
    const rows = await this.reserved.unsafe(compiled.sql, compiled.parameters as never[])
    return { rows: [...rows] as R[] }
  }

  // eslint-disable-next-line require-yield
  async *streamQuery(): AsyncIterableIterator<never> {
    throw new Error('Not implemented: streaming is not used by the query layer')
  }
}

class PostgresJsDriver implements Driver {
  constructor(private readonly sql: Sql) {}
  async init() {}
  async acquireConnection() { return new PostgresJsConnection(await this.sql.reserve()) }
  async beginTransaction(connection: PostgresJsConnection) { await connection.reserved.unsafe('begin') }
  async commitTransaction(connection: PostgresJsConnection) { await connection.reserved.unsafe('commit') }
  async rollbackTransaction(connection: PostgresJsConnection) { await connection.reserved.unsafe('rollback') }
  async releaseConnection(connection: PostgresJsConnection) { connection.reserved.release() }
  async destroy() {}
}

export class PostgresJsDialect implements Dialect {
  constructor(private readonly sql: Sql) {}
  createAdapter = () => new PostgresAdapter()
  createDriver = () => new PostgresJsDriver(this.sql)
  createQueryCompiler = () => new PostgresQueryCompiler()
  createIntrospector = (db: never) => new PostgresIntrospector(db)
}
