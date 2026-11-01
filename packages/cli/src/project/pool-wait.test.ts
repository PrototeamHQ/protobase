import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionsBusy } from '@protobase/server'
import { connectOrBusy } from './pool-wait'

// A pool whose connect resolves or rejects when the test says so.
const pool = (state: { totalCount: number; idleCount: number }) => {
  const client = { release: vi.fn(), query: vi.fn() }
  let settle = { resolve: (_: typeof client) => {}, reject: (_: Error) => {} }
  const connect = vi.fn(
    () =>
      new Promise<typeof client>((resolve, reject) => {
        settle = { resolve, reject }
      }),
  )
  return { pool: { ...state, options: { max: 3 }, connect }, client, open: () => settle.resolve(client), fail: (error: Error) => settle.reject(error) }
}

const outcome = (promise: Promise<unknown>) => promise.then((value) => ({ value }), (error: unknown) => ({ error }))

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('connectOrBusy', () => {
  it('fails with ConnectionsBusy when every connection stays in use for two seconds', async () => {
    const { pool: full } = pool({ totalCount: 3, idleCount: 0 })
    const result = outcome(connectOrBusy(full)())
    await vi.advanceTimersByTimeAsync(2_000)
    const { error } = (await result) as { error: unknown }
    expect(error).toBeInstanceOf(ConnectionsBusy)
    expect(error).toMatchObject({ message: 'All 3 database connections stayed busy for 2 s', connections: 3, waitedMs: 2_000 })
  })

  it('hands over a connection freed within two seconds', async () => {
    const { pool: full, client, open } = pool({ totalCount: 3, idleCount: 0 })
    const result = connectOrBusy(full)()
    await vi.advanceTimersByTimeAsync(1_900)
    open()
    expect(await result).toBe(client)
    expect(client.release).not.toHaveBeenCalled()
  })

  it('releases the connection a query that gave up gets later, and ignores a later failure of its wait', async () => {
    const late = pool({ totalCount: 3, idleCount: 0 })
    const result = outcome(connectOrBusy(late.pool)())
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await result).toMatchObject({ error: expect.any(ConnectionsBusy) })
    late.open()
    await vi.advanceTimersByTimeAsync(0)
    expect(late.client.release).toHaveBeenCalledOnce()

    const failed = pool({ totalCount: 3, idleCount: 0 })
    const failing = outcome(connectOrBusy(failed.pool)())
    await vi.advanceTimersByTimeAsync(2_000)
    failed.fail(new Error('timeout exceeded when trying to connect'))
    await vi.advanceTimersByTimeAsync(0)
    expect(await failing).toMatchObject({ error: expect.any(ConnectionsBusy) })
  })

  it('waits as long as the pool lets a new connection open when there is room for one, such as while the database wakes', async () => {
    const { pool: room, client, open } = pool({ totalCount: 1, idleCount: 0 })
    const result = connectOrBusy(room)()
    await vi.advanceTimersByTimeAsync(10_000)
    open()
    expect(await result).toBe(client)
  })

  it("keeps the pool's own failure, such as a connection that could not open", async () => {
    const refused = new Error('connect ECONNREFUSED')
    for (const state of [{ totalCount: 1, idleCount: 0 }, { totalCount: 3, idleCount: 1 }, { totalCount: 3, idleCount: 0 }]) {
      const { pool: failing, fail } = pool(state)
      const result = connectOrBusy(failing)()
      fail(refused)
      await expect(result).rejects.toBe(refused)
    }
  })
})
