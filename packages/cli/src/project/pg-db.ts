import { appPool, readDbConnections } from '@protobase/server'
import { Kysely, PostgresDialect } from 'kysely'
import { gateBackgroundWork } from './background-gate'

type PgModule = Pick<typeof import('pg'), 'Pool' | 'types'>

// Kysely over the app's pool on `url` (`appPool`, which the app's Better Auth store shares), with `max` connections.
// Function calls and jobs share them with requests but hold at most one less, so a request always finds a connection
// they cannot take.
export const createPgDb = (pg: PgModule, url: string, max = readDbConnections(process.env)) => {
  const pool = appPool(pg, url, max)
  return new Kysely<any>({ dialect: new PostgresDialect({ pool: gateBackgroundWork(pool, Math.max(1, max - 1)) }) })
}
