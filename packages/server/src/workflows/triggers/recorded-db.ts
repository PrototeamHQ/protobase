import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type DatabaseConnection, type Driver } from 'kysely'

/** A statement the trigger code ran: its SQL on one line, and its parameters. */
export type Recorded = { sql: string; parameters: readonly unknown[] }

/**
 * A database for the tests of the trigger jobs that records each statement and answers it with the rows `answer`
 * gives for it, none by default; transactions are recorded as `begin`, `commit` and `rollback`.
 */
export const recordedDb = (answer: (statement: Recorded) => Record<string, unknown>[] = () => []) => {
  const statements: Recorded[] = []
  const connection: DatabaseConnection = {
    executeQuery: async (query) => {
      const statement = { sql: query.sql.replace(/\s+/g, ' ').trim(), parameters: query.parameters }
      statements.push(statement)
      return { rows: answer(statement) as never[] }
    },
    streamQuery: () => {
      throw new Error('Not implemented: the trigger jobs stream nothing')
    },
  }
  const mark = (sql: string) => async () => void statements.push({ sql, parameters: [] })
  const driver: Driver = {
    init: async () => {},
    acquireConnection: async () => connection,
    beginTransaction: mark('begin'),
    commitTransaction: mark('commit'),
    rollbackTransaction: mark('rollback'),
    releaseConnection: async () => {},
    destroy: async () => {},
  }
  const db = new Kysely<any>({
    dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => driver, createIntrospector: (k) => new PostgresIntrospector(k), createQueryCompiler: () => new PostgresQueryCompiler() },
  })
  return { db, statements }
}
