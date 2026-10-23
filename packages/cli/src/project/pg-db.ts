import { appPool, longQueryPool, readDbConnections, wantsLongQueries } from '@protobase/server'
import { Kysely, PostgresDialect } from 'kysely'
import { gateBackgroundWork } from './background-gate'
import { connectLong } from './long-connect'
import { connectOrBusy } from './pool-wait'

type PgModule = Pick<typeof import('pg'), 'Pool' | 'types'>

// Kysely over the app's pool on `url` (`appPool`, which the app's Better Auth store shares), with `max` connections.
// A query waits at most `poolWaitMs` for a free one. Function calls and jobs share them with requests but hold at most
// one less, so a request always finds a connection they cannot take; those with `longQueries` take theirs from a pool
// of one connection whose queries may run up to `longQueryTimeoutMs` (`longQueryPool`), within the same slots.
export const createPgDb = (pg: PgModule, url: string, max = readDbConnections(process.env)) => {
  const pool = appPool(pg, url, max)
  const long = longQueryPool(pg, url)
  const shortConnect = connectOrBusy(pool)
  const longConnect = connectLong(long)
  const routed = {
    options: pool.options,
    connect: () => (wantsLongQueries() ? longConnect() : shortConnect()),
    end: async () => {
      await Promise.all([pool.end(), long.end()])
    },
  }
  return new Kysely<any>({ dialect: new PostgresDialect({ pool: gateBackgroundWork(routed, Math.max(1, max - 1)) }) })
}
