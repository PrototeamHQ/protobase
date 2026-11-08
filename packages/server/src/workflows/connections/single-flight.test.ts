import { describe, expect, it } from 'vitest'
import { singleFlight } from './single-flight'

describe('singleFlight', () => {
  it('joins overlapping calls of one key into one, and starts afresh once it settled', async () => {
    let calls = 0
    const once = singleFlight<number>()
    const call = () => new Promise<number>((resolve) => setTimeout(() => resolve(++calls), 5))
    expect(await Promise.all([once('a', call), once('a', call), once('b', call)])).toEqual([1, 1, 2])
    expect(await once('a', call)).toBe(3)
  })
})
