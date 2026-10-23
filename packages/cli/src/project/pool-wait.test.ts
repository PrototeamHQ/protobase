import { describe, expect, it } from 'vitest'
import { ConnectionsBusy } from '@protobase/server'
import { connectOrBusy } from './pool-wait'

const timedOut = new Error('timeout exceeded when trying to connect')
const pool = (state: { totalCount: number; idleCount: number }, connect: () => Promise<never>) => ({ ...state, ending: false, options: { max: 3 }, connect })

describe('connectOrBusy', () => {
  it('fails with ConnectionsBusy when every connection was in use and the wait ran out', async () => {
    const failure = await connectOrBusy(pool({ totalCount: 3, idleCount: 0 }, () => Promise.reject(timedOut)))().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(ConnectionsBusy)
    expect(failure).toMatchObject({ message: 'All 3 database connections stayed busy for 2 s', connections: 3, waitedMs: 2_000, cause: timedOut })
  })

  it("keeps the pool's own failure when a connection was free, such as one that could not open", async () => {
    const refused = new Error('connect ECONNREFUSED')
    await expect(connectOrBusy(pool({ totalCount: 1, idleCount: 0 }, () => Promise.reject(refused)))()).rejects.toBe(refused)
    await expect(connectOrBusy(pool({ totalCount: 3, idleCount: 1 }, () => Promise.reject(refused)))()).rejects.toBe(refused)
  })
})
