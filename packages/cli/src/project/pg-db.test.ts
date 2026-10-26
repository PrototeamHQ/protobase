import { EventEmitter } from 'node:events'
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { runInBackground } from '@protobase/server'
import { appPool } from '@protobase/server/internal'
import { createPgDb } from './pg-db'

// node-postgres's Pool with room for every checkout, whose clients answer each query with their pool's size.
const fakePg = () => {
  const created: any[] = []
  class Pool extends EventEmitter {
    ending = false
    totalCount = 0
    idleCount = 0
    constructor(readonly options: any) {
      super()
      created.push(this)
    }
    connect = async () => ({
      query: async () => ({ rows: [{ max: this.options.max }], command: 'SELECT', rowCount: 1 }),
      release: () => {},
    })
    end = async () => {
      this.ending = true
    }
  }
  return { pg: { Pool, types: { getTypeParser: () => (value: string) => value } } as any, created }
}

let urls = 0
const freshUrl = () => `postgres://pg-db-test/${++urls}`

const poolSizeOf = async (db: ReturnType<typeof createPgDb>) => (await sql<{ max: number }>`select 1`.execute(db)).rows[0]!.max

describe('createPgDb', () => {
  it("opens the app's pool, which the app's own code shares, and a long-query pool, and ends both", async () => {
    const { pg, created } = fakePg()
    const url = freshUrl()
    const db = createPgDb(pg, url, 3)
    expect(appPool(pg, url, 3)).toBe(created[0])
    expect(created.map((pool) => pool.options.max)).toEqual([3, 1])
    await poolSizeOf(db)
    await db.destroy()
    expect(created.every((pool) => pool.ending)).toBe(true)
  })

  it('takes the connections of background work with longQueries from the long-query pool, and every other from the app pool', async () => {
    const { pg } = fakePg()
    const db = createPgDb(pg, freshUrl(), 3)
    expect(await poolSizeOf(db)).toBe(3)
    expect(await runInBackground(() => poolSizeOf(db))).toBe(3)
    expect(await runInBackground(() => poolSizeOf(db), { longQueries: true })).toBe(1)
  })
})
