import { Kysely, PostgresDialect } from 'kysely'

type PgModule = Pick<typeof import('pg'), 'Pool' | 'types'>

// Kysely over node-postgres; date and timestamp (without zone) stay text, the API formats them itself.
export const createPgDb = (pg: PgModule, url: string, max = 10) => {
  const types = {
    getTypeParser: (oid: number, format?: 'text' | 'binary') =>
      oid === 1082 || oid === 1114 ? (value: string) => value : pg.types.getTypeParser(oid, format as 'text'),
  }
  return new Kysely<any>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max, types }) }) })
}
