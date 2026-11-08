import { describe, expect, it } from 'vitest'
import { movePlan } from './move-plan'

const list = (...keys: string[]) => keys.map((key, index) => ({ key, rank: index + 1 }))

describe('movePlan', () => {
  it('numbers the records between the old and the new place, down the list', () => {
    expect(movePlan(list('a', 'b', 'c', 'd'), 'a', 'c', 'd')).toEqual({ keys: ['b', 'c', 'a'], start: 1 })
  })

  it('numbers the records between the old and the new place, up the list', () => {
    expect(movePlan(list('a', 'b', 'c', 'd'), 'd', 'a', 'b')).toEqual({ keys: ['d', 'b', 'c'], start: 2 })
  })

  it('puts the record first after no record, and last before none', () => {
    expect(movePlan(list('a', 'b', 'c'), 'c', null, 'a')).toEqual({ keys: ['c', 'a', 'b'], start: 1 })
    expect(movePlan(list('a', 'b', 'c'), 'a', 'c', null)).toEqual({ keys: ['b', 'c', 'a'], start: 1 })
  })

  it('saves while records were added or removed elsewhere in the list', () => {
    const rows = [...list('a', 'b', 'c', 'd'), { key: 'e', rank: 9 }].filter((row) => row.key !== 'b')
    expect(movePlan(rows, 'd', 'a', 'c')).toEqual({ keys: ['d', 'c'], start: 2 })
  })

  it('saves from the stored order when the records between moved since', () => {
    // Seen as a, b, c, d, e; someone moved b below d meanwhile, which leaves c after a
    const rows = [{ key: 'a', rank: 1 }, { key: 'c', rank: 3 }, { key: 'd', rank: 4 }, { key: 'b', rank: 5 }, { key: 'e', rank: 6 }]
    expect(movePlan(rows, 'e', 'a', 'c')).toEqual({ keys: ['e', 'c', 'd', 'b'], start: 2 })
  })

  it('is stale when another record now follows the anchor, in either direction of the move', () => {
    // Seen as x, p, a, b; y was moved up to just after a
    const rows = [{ key: 'x', rank: 1 }, { key: 'p', rank: 2 }, { key: 'a', rank: 3 }, { key: 'y', rank: 4 }, { key: 'b', rank: 5 }]
    expect(movePlan(rows, 'x', 'a', 'b')).toEqual({ stale: true })
    expect(movePlan(rows, 'b', 'x', 'p')).toEqual({ keys: ['b', 'p', 'a', 'y'], start: 2 })
    expect(movePlan([...rows, { key: 'z', rank: 6 }], 'z', 'a', 'b')).toEqual({ stale: true })
  })

  it('is stale when the anchor or the record after it left the list', () => {
    expect(movePlan(list('a', 'c', 'd'), 'd', 'b', 'c')).toEqual({ stale: true })
    expect(movePlan(list('a', 'c', 'd'), 'd', 'a', 'b')).toEqual({ stale: true })
  })

  it('is stale when a record now follows the anchor at the end', () => {
    expect(movePlan(list('a', 'b', 'c'), 'a', 'b', null)).toEqual({ stale: true })
  })

  it('checks only the anchor when the record after it is not known', () => {
    expect(movePlan(list('a', 'b', 'c', 'd'), 'a', 'b', undefined)).toEqual({ keys: ['b', 'a'], start: 1 })
    expect(movePlan(list('a', 'c', 'd'), 'd', 'b', undefined)).toEqual({ stale: true })
  })

  it('writes nothing when the record is already in its place', () => {
    expect(movePlan([{ key: 'a', rank: 2 }, { key: 'b', rank: 3 }, { key: 'x', rank: 9 }], 'x', 'b', null)).toEqual({ keys: [], start: 1 })
  })

  it('has no plan when the moved record is not in the list', () => {
    expect(movePlan(list('a', 'b'), 'z', 'a', 'b')).toBeUndefined()
  })
})
