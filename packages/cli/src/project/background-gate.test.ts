import type { PostgresPoolClient } from 'kysely'
import { describe, expect, it } from 'vitest'
import { runInBackground } from '@protobase/server'
import { gateBackgroundWork } from './background-gate'

// A pool with room for every checkout, which counts the clients out; its clients only release.
const fakePool = () => {
  const pool = {
    out: 0,
    options: {},
    connect: async () => {
      pool.out++
      let released = false
      const release = () => {
        if (released) throw new Error('Release called on client which has already been released to the pool.')
        released = true
        pool.out--
      }
      return { release } as unknown as PostgresPoolClient
    },
    end: async () => {},
  }
  return pool
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('gateBackgroundWork', () => {
  it('holds background work to its slots and leaves requests the rest', async () => {
    const pool = fakePool()
    const gated = gateBackgroundWork(pool, 2)
    const first = await runInBackground(() => gated.connect())
    await runInBackground(() => gated.connect())
    let third: PostgresPoolClient | undefined
    void runInBackground(() => gated.connect()).then((client) => (third = client))
    await settle()
    expect(third).toBeUndefined()
    const request = await gated.connect()
    expect(pool.out).toBe(3)
    request.release()

    first.release()
    await settle()
    expect(third).toBeDefined()
    expect(pool.out).toBe(2)
    expect(() => first.release()).toThrow('already been released')
    third!.release()
    expect(pool.out).toBe(1)
  })

  it('frees the slot of a connection that failed', async () => {
    const pool = fakePool()
    const failing = { ...pool, connect: () => Promise.reject(new Error('too many connections for role')) }
    const gated = gateBackgroundWork(failing, 1)
    await expect(runInBackground(() => gated.connect())).rejects.toThrow('too many connections')
    await expect(runInBackground(() => gated.connect())).rejects.toThrow('too many connections')
  })
})
