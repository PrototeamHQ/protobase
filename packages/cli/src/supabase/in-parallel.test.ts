import { describe, expect, it } from 'vitest'
import { inParallel } from './in-parallel'

describe('inParallel', () => {
  it('runs at most `limit` at once and gives the results in order', async () => {
    let running = 0
    let most = 0
    const results = await inParallel([30, 10, 20, 0, 5], 2, async (ms) => {
      most = Math.max(most, ++running)
      await new Promise((resolve) => setTimeout(resolve, ms))
      running -= 1
      return ms * 2
    })
    expect(results).toEqual([60, 20, 40, 0, 10])
    expect(most).toBe(2)
  })
})
