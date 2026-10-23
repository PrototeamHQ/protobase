import { EventEmitter } from 'node:events'
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { appPool } from '@protobase/server'
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
  it("opens the app's pool, which the app's own code shares, and ends it", async () => {
    const { pg, created } = fakePg()
    const url = freshUrl()
    const db = createPgDb(pg, url, 3)
    expect(appPool(pg, url, 3)).toBe(created[0])
    expect(created.map((pool) => pool.options.max)).toEqual([3])
    expect(await poolSizeOf(db)).toBe(3)
    await db.destroy()
    expect(created[0].ending).toBe(true)
  })
})
