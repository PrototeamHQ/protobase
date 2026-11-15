import { describe, expect, it } from 'vitest'
import { plannedCount } from './planned-count'

const read = { isPending: false, error: null }

describe('plannedCount', () => {
  it('takes a count’s total, or the count of the group of the record around it', () => {
    expect(plannedCount({ ...read, rows: [], total: 37 })).toBe(37)
    expect(plannedCount({ ...read, rows: [{ value: 1, count: 37 }] })).toBe(37)
  })

  it('counts 0 for a record whose rows make no group', () => {
    expect(plannedCount({ ...read, rows: [] })).toBe(0)
  })
})
