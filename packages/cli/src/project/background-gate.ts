import type { PostgresPool } from 'kysely'
import { isBackgroundWork } from '@protobase/server'

/**
 * The pool as Kysely uses it, where background work (function calls and jobs) holds at most `slots` connections at
 * once and waits for one of its own after that; page and API requests take any connection the pool has.
 */
export const gateBackgroundWork = (pool: PostgresPool, slots: number): PostgresPool => {
  let used = 0
  const waiting: Array<() => void> = []
  const take = () => {
    if (used < slots) return void used++
    return new Promise<void>((resolve) => waiting.push(resolve))
  }
  // A freed slot goes straight to the next waiter, so `used` only drops when nobody waits.
  const free = () => {
    const next = waiting.shift()
    if (next) return next()
    used--
  }
  const connectInBackground = async () => {
    await take()
    const client = await pool.connect().catch((error: unknown) => {
      free()
      throw error
    })
    // pg gives a client a new `release` on every checkout, which throws when called twice.
    const release = client.release
    client.release = () => {
      release.call(client)
      free()
    }
    return client
  }
  return {
    ...(pool.Client && { Client: pool.Client }),
    options: pool.options,
    connect: () => (isBackgroundWork() ? connectInBackground() : pool.connect()),
    end: () => pool.end(),
  }
}
