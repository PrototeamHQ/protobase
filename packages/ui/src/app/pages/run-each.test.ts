import { describe, expect, it } from 'vitest'
import { runEach, type EachVerdict } from './run-each'

const refusedError = new Error('refused')
const isRefusal = (error: unknown) => error === refusedError

describe('runEach', () => {
  it('runs on the records it applies to in order, and counts those it skips', async () => {
    const ran: number[] = []
    const outcome = await runEach([1, 2, 3, 4], (n) => (n % 2 === 0 ? 'run' : 'skip'), async (n) => void ran.push(n), isRefusal)
    expect(ran).toEqual([2, 4])
    expect(outcome).toEqual({ done: 2, skipped: 2, failed: 0, refused: [] })
  })

  it('goes on after a failure, counting it apart from the skipped and keeping the first', async () => {
    const first = new Error('stale')
    const outcome = await runEach([1, 2, 3], () => 'run', async (n) => {
      if (n === 1) throw first
      if (n === 3) throw new Error('declined')
    }, isRefusal)
    expect(outcome).toEqual({ done: 1, skipped: 0, failed: 2, refused: [], error: first })
  })

  it('names the records it refuses, before running and when the run is refused, while the others run', async () => {
    const ran: number[] = []
    const verdict = (n: number): EachVerdict => (n === 2 ? 'refuse' : 'run')
    const outcome = await runEach([1, 2, 3, 4], verdict, async (n) => {
      if (n === 4) throw refusedError
      ran.push(n)
    }, isRefusal)
    expect(ran).toEqual([1, 3])
    expect(outcome).toEqual({ done: 2, skipped: 0, failed: 0, refused: [2, 4] })
  })
})
