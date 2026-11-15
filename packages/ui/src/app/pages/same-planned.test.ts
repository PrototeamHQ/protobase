import { describe, expect, it } from 'vitest'
import { samePlanned } from './same-planned'

const row = { id: 1 }
const planned = { isPending: false, error: null, rows: [row] }

describe('samePlanned', () => {
  it('keeps what it had while the read holds the same rows', () => {
    expect(samePlanned(planned, { ...planned, rows: [row] })).toBe(planned)
  })

  it('takes the new one once a row, the total or the state changes', () => {
    const next = [{ ...planned, rows: [{ id: 1 }] }, { ...planned, total: 3 }, { ...planned, isPending: true }]
    for (const each of next) expect(samePlanned(planned, each)).toBe(each)
  })

  it('takes none when the read is gone', () => {
    expect(samePlanned(planned, undefined)).toBeUndefined()
  })
})
