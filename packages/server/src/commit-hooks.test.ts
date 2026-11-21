import { EventEmitter } from 'node:events'
import { Kysely, PostgresDialect, type PostgresPool } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { appDialect } from './app-dialect'
import { afterCommit } from './commit-hooks'

// A pool of one pg client that records the statements it was sent.
const recordingPool = () => {
  const sent: string[] = []
  const client = Object.assign(new EventEmitter(), {
    query: vi.fn(async (text: string) => {
      sent.push(text)
      return { rows: [], command: 'SELECT', rowCount: 0 }
    }),
    release: vi.fn(),
  })
  const pool: PostgresPool = { options: {}, connect: async () => client as any, end: async () => {} }
  return { sent, client, pool }
}

describe('afterCommit', () => {
  it('runs after the transaction committed', async () => {
    const { sent, pool } = recordingPool()
    const db = new Kysely<any>({ dialect: appDialect(pool) })
    const seen: string[][] = []
    await db.transaction().execute(async (trx) => {
      expect(await afterCommit(trx, () => seen.push([...sent]))).toBe(true)
    })
    expect(seen).toEqual([['begin', 'commit']])
  })

  it('never runs when the transaction rolls back, nor in the next one on that connection', async () => {
    const { pool } = recordingPool()
    const db = new Kysely<any>({ dialect: appDialect(pool) })
    const run = vi.fn()
    await expect(db.transaction().execute(async (trx) => {
      await afterCommit(trx, run)
      throw new Error('the write failed')
    })).rejects.toThrow('the write failed')
    await db.transaction().execute(async () => {})
    expect(run).not.toHaveBeenCalled()
  })

  it('never runs when the commit fails', async () => {
    const { client, pool } = recordingPool()
    const db = new Kysely<any>({ dialect: appDialect(pool) })
    client.query.mockImplementation(async (text: string) => {
      if (text === 'commit') throw new Error('could not serialize access')
      return { rows: [], command: 'SELECT', rowCount: 0 }
    })
    const run = vi.fn()
    await expect(db.transaction().execute((trx) => afterCommit(trx, run))).rejects.toThrow('could not serialize access')
    expect(run).not.toHaveBeenCalled()
  })

  it('says it will not run on a transaction of another driver', async () => {
    const { pool } = recordingPool()
    const db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) })
    await db.transaction().execute(async (trx) => {
      expect(await afterCommit(trx, () => {})).toBe(false)
    })
  })

  it('needs a transaction', async () => {
    const { pool } = recordingPool()
    const db = new Kysely<any>({ dialect: appDialect(pool) })
    await expect(afterCommit(db, () => {})).rejects.toThrow('afterCommit needs a transaction')
  })
})
