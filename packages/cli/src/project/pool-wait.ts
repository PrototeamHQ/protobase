import type { PostgresPoolClient } from 'kysely'
import { ConnectionsBusy, poolWaitMs } from '@protobase/server'

type CountedPool = {
  connect(): Promise<PostgresPoolClient>
  readonly totalCount: number
  readonly idleCount: number
  readonly options: { max?: number }
}

/**
 * The pool's `connect`, where a query that finds every connection in use and waits `poolWaitMs` for one fails with
 * `ConnectionsBusy`, so a saturated app answers at once rather than queue requests behind slow ones. A query that finds
 * a connection free, or room for a new one, waits as long as the pool lets a new connection take to open, such as while
 * a database that scaled to zero wakes. The pool still hands a query that gave up the connection it waited for, which
 * goes straight back.
 */
export const connectOrBusy = (pool: CountedPool) => async () => {
  const max = pool.options.max ?? 10
  const full = pool.totalCount >= max && pool.idleCount === 0
  if (!full) return pool.connect()
  const connecting = pool.connect()
  let timer: ReturnType<typeof setTimeout> | undefined
  const gaveUp = new Promise<'gave up'>((resolve) => {
    timer = setTimeout(() => resolve('gave up'), poolWaitMs)
  })
  const first = await Promise.race([connecting, gaveUp]).finally(() => clearTimeout(timer))
  if (first !== 'gave up') return first
  // The query already failed with ConnectionsBusy, so a later failure of its wait has nobody left to tell.
  connecting.then(
    (client) => client.release(),
    () => {},
  )
  throw new ConnectionsBusy(max, poolWaitMs)
}
