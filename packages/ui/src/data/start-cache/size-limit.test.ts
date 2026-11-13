import { describe, expect, it } from 'vitest'
import { byteSize, withinLimit, type Sized } from './size-limit'

const query = (hash: string, bytes: number, lastUsed: number, pinned = false): Sized => ({ hash, bytes, lastUsed, pinned })

describe('the soft limit on the start cache', () => {
  it('keeps everything while the total stays within the limit', () => {
    expect(withinLimit([query('a', 40, 1), query('b', 60, 2)], 100)).toEqual(new Set(['a', 'b']))
  })

  it('evicts the least recently used first, until the total is back within the limit', () => {
    const entries = [query('newest', 30, 30), query('oldest', 30, 10), query('middle', 30, 20), query('older', 30, 15)]
    expect(withinLimit(entries, 70)).toEqual(new Set(['newest', 'middle']))
  })

  it('evicts no more than it takes to get back within the limit', () => {
    expect(withinLimit([query('a', 50, 1), query('b', 10, 2), query('c', 50, 3)], 100)).toEqual(new Set(['b', 'c']))
  })

  it('never evicts a pinned query, such as /meta, however old', () => {
    const entries = [query('meta', 80, 1, true), query('a', 30, 2), query('b', 30, 3)]
    expect(withinLimit(entries, 100)).toEqual(new Set(['meta']))
  })

  it('measures what a value takes as UTF-8 JSON', () => {
    expect(byteSize({ name: 'é' })).toBe('{"name":"é"}'.length + 1)
    expect(byteSize(undefined)).toBe(0)
  })
})
