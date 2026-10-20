import { describe, expect, it } from 'vitest'
import { runEach } from './run-each'

describe('runEach', () => {
  it('runs on the records it applies to in order, and counts those it skips', async () => {
    const ran: number[] = []
    const outcome = await runEach([1, 2, 3, 4], (n) => n % 2 === 0, async (n) => void ran.push(n))
    expect(ran).toEqual([2, 4])
    expect(outcome).toEqual({ done: 2, skipped: 2, failed: 0 })
  })

  it('goes on after a failure, counting it apart from the skipped and keeping the first', async () => {
    const first = new Error('stale')
    const outcome = await runEach([1, 2, 3], () => true, async (n) => {
      if (n === 1) throw first
      if (n === 3) throw new Error('declined')
    })
    expect(outcome).toEqual({ done: 1, skipped: 0, failed: 2, error: first })
  })
})
