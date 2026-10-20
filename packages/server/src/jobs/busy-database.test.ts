import { describe, expect, it } from 'vitest'
import { busyDatabase } from './busy-database'

describe('busyDatabase', () => {
  it('is busy while a statement runs, and idle once it answered or failed', async () => {
    let finish!: () => void
    const { db, idle } = busyDatabase({ executeSql: () => new Promise((resolve) => (finish = () => resolve({ rows: [] }))) })
    expect(idle()).toBe(true)
    const running = db.executeSql('select 1')
    expect(idle()).toBe(false)
    finish()
    expect(await running).toEqual({ rows: [] })
    expect(idle()).toBe(true)

    const failing = busyDatabase({ executeSql: async () => { throw new Error('gone') } })
    await expect(failing.db.executeSql('select 1')).rejects.toThrow('gone')
    expect(failing.idle()).toBe(true)
  })
})
