import { handleDroppedConnections } from './dropped-connections'
import { longQueryTimeoutMs } from './statement-timeout'

/** How long a query waits for a free connection of the app's pool before it fails with `ConnectionsBusy`. */
export const poolWaitMs = 2_000

/** How many connections the app's pool opens: `PROTOBASE_DB_CONNECTIONS`, such as its plan's limit, or 10. */
export const readDbConnections = (env: Record<string, string | undefined>) => {
  if (!env.PROTOBASE_DB_CONNECTIONS) return 10
  const connections = Number(env.PROTOBASE_DB_CONNECTIONS)
  if (!Number.isInteger(connections) || connections < 1) throw new Error(`PROTOBASE_DB_CONNECTIONS must be a whole number of connections, at least 1, not "${env.PROTOBASE_DB_CONNECTIONS}"`)
  return connections
}

type TypeParser = (oid: number, format?: 'text' | 'binary') => unknown

// Date and timestamp (without zone) stay text, which the API formats itself.
const textDates = (pg: { types: { getTypeParser: TypeParser } }) => ({
  getTypeParser: (oid: number, format?: 'text' | 'binary') => (oid === 1082 || oid === 1114 ? (value: string) => value : pg.types.getTypeParser(oid, format)),
})

/** The settings `appPool` and `longQueryPool` open node-postgres's pool with. */
export type AppPoolConfig = { connectionString: string; max: number; connectionTimeoutMillis: number; allowExitOnIdle: true; statement_timeout?: number; types: { getTypeParser: TypeParser } }

type PgPool = {
  readonly ending: boolean
  on(event: 'connect', listener: (client: { on(event: 'error', listener: (error: Error) => void): unknown }) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}

/** The part of node-postgres `appPool` needs: the app's own `import pg from 'pg'`. */
export type PgModule<P extends PgPool> = { Pool: new (config: AppPoolConfig) => P; types: { getTypeParser: TypeParser } }

const store = globalThis as { __protobaseAppPools?: Map<string, { pool: PgPool; max: number }> }

/**
 * The app's one pool on the database at `url`, with `max` connections (`PROTOBASE_DB_CONNECTIONS` by default): the
 * runtime's, which `protobase dev` and `serve` open, and the one the app's own code uses, such as its Better Auth store.
 * Whoever asks first opens it, and everyone in the process shares it, across a dev server's reloads too, until it ends;
 * so the app never opens more connections than it may. Date and timestamp (without zone) come back as text, which the
 * API formats itself, a dropped connection is printed rather than fatal, and a query waits at most `poolWaitMs` for a
 * free connection. Idle connections keep no process alive, so a command exits when its work is done even while
 * nobody ends the pool, such as one that sent no query of its own after Better Auth's schema check.
 */
export const appPool = <P extends PgPool>(pg: PgModule<P>, url: string, max = readDbConnections(globalThis.process?.env ?? {})): P => {
  const pools = (store.__protobaseAppPools ??= new Map())
  // It holds the open pools only: one that ended is dropped, whatever database it is on.
  for (const [key, entry] of pools) if (entry.pool.ending) pools.delete(key)
  const known = pools.get(url)
  if (known) {
    if (known.max !== max) throw new Error(`The app's pool on this database is open with ${known.max} connections, so it cannot open with ${max}: give both the same PROTOBASE_DB_CONNECTIONS`)
    return known.pool as P
  }
  const pool = handleDroppedConnections(new pg.Pool({ connectionString: url, max, connectionTimeoutMillis: poolWaitMs, allowExitOnIdle: true, types: textDates(pg) }))
  pools.set(url, { pool, max })
  return pool
}

/**
 * The runtime's pool of one connection on `url` for the queries of functions and jobs with `longQueries`: it asks for
 * `statement_timeout` = `longQueryTimeoutMs` when it logs in, which Postgres takes, and the platform's pooler too, since
 * it tracks that setting (`track_extra_parameters`). A query waits for that connection as long as one may run on it.
 * It opens its connection on first use, and nobody else shares it.
 */
export const longQueryPool = <P extends PgPool>(pg: PgModule<P>, url: string): P =>
  handleDroppedConnections(new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: longQueryTimeoutMs, allowExitOnIdle: true, statement_timeout: longQueryTimeoutMs, types: textDates(pg) }))
