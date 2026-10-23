import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { appPool, readDbConnections } from './app-pool'

// node-postgres's Pool as far as appPool reads it: the options it was made with, and whether it ends.
const fakePg = () => {
  const created: FakePool[] = []
  class FakePool extends EventEmitter {
    ending = false
    constructor(readonly options: any) {
      super()
      created.push(this)
    }
  }
  return { pg: { Pool: FakePool, types: { getTypeParser: () => (value: string) => `parsed ${value}` } }, created }
}

let urls = 0
const freshUrl = () => `postgres://app-pool-test/${++urls}`

describe('appPool', () => {
  it('opens one pool per database, which every later caller shares until it ends', () => {
    const { pg, created } = fakePg()
    const url = freshUrl()
    const first = appPool(pg, url, 3)
    expect(appPool(pg, url, 3)).toBe(first)
    expect(created).toHaveLength(1)
    first.ending = true
    expect(appPool(pg, url, 3)).not.toBe(first)
  })

  it('forgets a pool once it ended, so a later one on its database opens with any size', () => {
    const { pg } = fakePg()
    const url = freshUrl()
    appPool(pg, url, 3).ending = true
    appPool(pg, freshUrl(), 3)
    expect(appPool(pg, url, 5).options.max).toBe(5)
  })

  it('refuses a second size for the same database', () => {
    const { pg } = fakePg()
    const url = freshUrl()
    appPool(pg, url, 3)
    expect(() => appPool(pg, url, 5)).toThrow("The app's pool on this database is open with 3 connections, so it cannot open with 5")
  })

  it('keeps date and timestamp as text, and survives a dropped connection', () => {
    const { pg, created } = fakePg()
    appPool(pg, freshUrl(), 3)
    const [pool] = created
    expect(pool!.options).toMatchObject({ max: 3 })
    expect(pool!.options.types.getTypeParser(1082)('2026-01-02')).toBe('2026-01-02')
    expect(pool!.options.types.getTypeParser(23)('5')).toBe('parsed 5')
    expect(pool!.listenerCount('connect')).toBe(1)
    expect(() => pool!.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow()
  })
})

describe('readDbConnections', () => {
  it('reads PROTOBASE_DB_CONNECTIONS, 10 without it, and refuses anything but a whole number from 1', () => {
    expect(readDbConnections({ PROTOBASE_DB_CONNECTIONS: '3' })).toBe(3)
    expect(readDbConnections({})).toBe(10)
    expect(() => readDbConnections({ PROTOBASE_DB_CONNECTIONS: '0' })).toThrow('PROTOBASE_DB_CONNECTIONS must be a whole number of connections, at least 1, not "0"')
  })
})
