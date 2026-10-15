import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

/** Kysely over one read-only session, for what the query package reads of the database, as the server reads it. */
export const readOnlyDb = (url: string) =>
  new Kysely<any>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 1, options: '-c default_transaction_read_only=on' }) }) })
