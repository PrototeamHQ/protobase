import { appPool, readDbConnections } from '@protobase/server'
import { Kysely, PostgresDialect } from 'kysely'
import { gateBackgroundWork } from './background-gate'
import { connectOrBusy } from './pool-wait'

type PgModule = Pick<typeof import('pg'), 'Pool' | 'types'>

// Kysely over the app's pool on `url` (`appPool`, which the app's Better Auth store shares), with `max` connections.
// A query waits at most `poolWaitMs` for a free one. Function calls and jobs share them with requests but hold at most
// one less, so a request always finds a connection they cannot take.
export const createPgDb = (pg: PgModule, url: string, max = readDbConnections(process.env)) => {
  const pool = appPool(pg, url, max)
  const bounded = { options: pool.options, connect: connectOrBusy(pool), end: () => pool.end() }
  return new Kysely<any>({ dialect: new PostgresDialect({ pool: gateBackgroundWork(bounded, Math.max(1, max - 1)) }) })
}
