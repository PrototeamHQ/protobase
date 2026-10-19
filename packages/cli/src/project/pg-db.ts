import { handleDroppedConnections } from '@protobase/server'
import { Kysely, PostgresDialect } from 'kysely'
import { gateBackgroundWork } from './background-gate'

type PgModule = Pick<typeof import('pg'), 'Pool' | 'types'>

// Kysely over node-postgres; date and timestamp (without zone) stay text, the API formats them itself;
// a dropped connection is printed, not fatal. Function calls and jobs share `max` connections with requests but hold
// at most one less, so a request always finds a connection they cannot take.
export const createPgDb = (pg: PgModule, url: string, max = 10) => {
  const types = {
    getTypeParser: (oid: number, format?: 'text' | 'binary') =>
      oid === 1082 || oid === 1114 ? (value: string) => value : pg.types.getTypeParser(oid, format as 'text'),
  }
  const pool = handleDroppedConnections(new pg.Pool({ connectionString: url, max, types }))
  return new Kysely<any>({ dialect: new PostgresDialect({ pool: gateBackgroundWork(pool, Math.max(1, max - 1)) }) })
}
