import type { PostgresPoolClient } from 'kysely'
import { ConnectionsBusy, poolWaitMs } from '@protobase/server'

type CountedPool = {
  connect(): Promise<PostgresPoolClient>
  readonly totalCount: number
  readonly idleCount: number
  readonly ending: boolean
  readonly options: { max?: number }
}

/**
 * The pool's `connect`, where a query that finds every connection in use and waits `poolWaitMs` for one (the pool's
 * own `connectionTimeoutMillis`) fails with `ConnectionsBusy`, so a saturated app answers at once rather than queue
 * requests behind slow ones. The pool tells its timeout by no code, so a failure counts as one when every connection
 * was in use as the query asked; any other failure is the pool's own.
 */
export const connectOrBusy = (pool: CountedPool) => async () => {
  const max = pool.options.max ?? 10
  const full = pool.totalCount >= max && pool.idleCount === 0
  try {
    return await pool.connect()
  } catch (error) {
    if (full && !pool.ending) throw new ConnectionsBusy(max, poolWaitMs, { cause: error })
    throw error
  }
}
