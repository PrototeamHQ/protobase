import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { databaseUrl } from './connection'

// date and timestamp (without zone) stay text; the API formats them itself
const types = {
  getTypeParser: (oid: number, format?: 'text' | 'binary') =>
    oid === 1082 || oid === 1114 ? (value: string) => value : pg.types.getTypeParser(oid, format as 'text'),
}

/** Kysely over node-postgres, the way a deployment of the API would connect. */
export const createDb = (max = 10) =>
  new Kysely<any>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: databaseUrl, max, types }) }) })
