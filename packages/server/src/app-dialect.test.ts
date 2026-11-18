import { EventEmitter } from 'node:events'
import { Kysely, sql } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { appDialect } from './app-dialect'
import { LostConnection } from './lost-connection'

const notQueryable = () => new Error('Client has encountered a connection error and is not queryable')

// A pool of one pg client, which drops when `drop` is called: it reports `reason` and fails every query after that.
const droppingPool = (reason: Error) => {
  let dropped = false
  const client = Object.assign(new EventEmitter(), {
    query: vi.fn(async (_text: string) => {
      if (dropped) throw notQueryable()
      return { rows: [], command: 'SELECT', rowCount: 0 }
    }),
    release: vi.fn(),
  })
  const drop = () => {
    dropped = true
    client.emit('error', reason)
  }
  const db = new Kysely<any>({ dialect: appDialect({ options: {}, connect: async () => client as any, end: async () => {} }) })
  return { client, drop, db }
}

describe('appDialect', () => {
  it('fails a transaction whose connection dropped with the reason, not with its failed rollback', async () => {
    const reason = new Error('terminating connection due to idle-in-transaction timeout')
    const { client, drop, db } = droppingPool(reason)
    const error = await db
      .transaction()
      .execute(async (trx) => {
        drop()
        await sql`select 1`.execute(trx)
      })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LostConnection)
    expect((error as Error).cause).toBe(reason)
    expect(client.query).toHaveBeenLastCalledWith('rollback', [])
    expect(client.release).toHaveBeenCalledWith(reason)
  })

  it("keeps the callback's own error when the rollback finds the connection gone", async () => {
    const { drop, db } = droppingPool(new Error('Connection terminated unexpectedly'))
    const own = new Error('the callback failed')
    const error = await db
      .transaction()
      .execute(async () => {
        drop()
        throw own
      })
      .catch((e: unknown) => e)
    expect(error).toBe(own)
  })

  it('fails a transaction with a rollback that fails on a connection that is still up', async () => {
    const { client, db } = droppingPool(new Error('unused'))
    const refused = new Error('rollback refused')
    client.query.mockImplementation(async (text: string) => {
      if (text === 'rollback') throw refused
      return { rows: [], command: 'SELECT', rowCount: 0 }
    })
    const error = await db
      .transaction()
      .execute(async () => {
        throw new Error('the callback failed')
      })
      .catch((e: unknown) => e)
    expect(error).toBe(refused)
  })
})
