import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type DatabaseConnection, type Driver } from 'kysely'
import { describe, expect, it } from 'vitest'
import type { RequestAccess } from '../request-access'
import { lockOrders, writeOrderLocks } from './order-lock'

// A database on one connection that records the parameters of each statement.
const recorder = () => {
  const locked: unknown[] = []
  const connection: DatabaseConnection = {
    executeQuery: async (query) => {
      locked.push(...query.parameters)
      return { rows: [] }
    },
    streamQuery: () => {
      throw new Error('Not implemented: taking a lock streams nothing')
    },
  }
  const driver: Driver = {
    init: async () => {},
    acquireConnection: async () => connection,
    beginTransaction: async () => {},
    commitTransaction: async () => {},
    rollbackTransaction: async () => {},
    releaseConnection: async () => {},
    destroy: async () => {},
  }
  const db = new Kysely<any>({
    dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => driver, createIntrospector: (k) => new PostgresIntrospector(k), createQueryCompiler: () => new PostgresQueryCompiler() },
  })
  return { db, locked }
}

describe('lockOrders', () => {
  it('takes each lock once, in sorted order, whatever order the batch names them in', async () => {
    const { db, locked } = recorder()
    await lockOrders(db, ['move:.tasks.rank', 'move:.lines.position', 'move:.tasks.rank'])
    expect(locked).toEqual(['move:.lines.position', 'move:.tasks.rank'])
  })
})

describe('writeOrderLocks', () => {
  const access = (position?: { field: string }) => ({ full: { table: { name: 'tasks' }, ...(position && { position }) } }) as unknown as RequestAccess

  it("takes the move's lock of the hand-order field a write sets", () => {
    expect(writeOrderLocks(access({ field: 'rank' }), { rank: 3, title: 'a' })).toEqual(['move:.tasks.rank'])
  })

  it('takes none for a write that leaves the hand-order field alone, or a resource without one', () => {
    expect(writeOrderLocks(access({ field: 'rank' }), { title: 'a' })).toEqual([])
    expect(writeOrderLocks(access(), { rank: 3 })).toEqual([])
    expect(writeOrderLocks(access({ field: 'rank' }), null)).toEqual([])
  })
})
