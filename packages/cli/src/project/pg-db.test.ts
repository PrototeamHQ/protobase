import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { createPgDb } from './pg-db'

const fakePg = () => {
  const created: any[] = []
  class Pool extends EventEmitter {
    constructor(readonly options: any) {
      super()
      created.push(this)
    }
  }
  const pg = { Pool, types: { getTypeParser: () => (value: string) => `parsed ${value}` } }
  return { pg: pg as any, created }
}

describe('createPgDb', () => {
  it('survives a dropped connection on the pool', () => {
    const { pg, created } = fakePg()
    createPgDb(pg, 'postgres://x')
    expect(created[0].listenerCount('connect')).toBe(1)
    expect(created[0].listenerCount('error')).toBe(1)
    expect(() => created[0].emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow()
  })

  it('keeps date and timestamp as text', () => {
    const { pg, created } = fakePg()
    createPgDb(pg, 'postgres://x')
    const { types } = created[0].options
    expect(types.getTypeParser(1082)('2026-01-02')).toBe('2026-01-02')
    expect(types.getTypeParser(23)('5')).toBe('parsed 5')
  })
})
