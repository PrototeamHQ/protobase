import { describe, expect, it } from 'vitest'
import type { ReplayedStep } from './port'
import { visitOutcomes } from './replay-match'

const step = (scope: string, seq: number, state: string, status: ReplayedStep['status'] = 'succeeded', attempt = 1): ReplayedStep => ({ scope, seq, state, status, attempt })

describe('visitOutcomes', () => {
  it('keys each last try by its scope, state and visit, through loops, retries and Map items', () => {
    const steps = [
      step('', 0, 'Fetch'),
      step('', 1, 'Fetch', 'retrying'),
      step('', 2, 'Fetch', 'succeeded', 2),
      step('', 3, 'Each'),
      step('Each.3[0]', 0, 'Send', 'retrying'),
      step('Each.3[0]', 1, 'Send', 'succeeded', 2),
      step('Each.3[1]', 0, 'Send'),
      step('', 4, 'Each'),
      step('Each.4[0]', 0, 'Send'),
    ]
    const keys = ['|Fetch|0', '|Fetch|1', '|Each|0', 'Each#0[0]|Send|0', 'Each#0[1]|Send|0', '|Each|1', 'Each#1[0]|Send|0']
    const lastTries = [steps[0], steps[2], steps[3], steps[5], steps[6], steps[7], steps[8]]
    expect(visitOutcomes([...steps].reverse())).toEqual(new Map(keys.map((key, index) => [key, lastTries[index]])))
  })

  it('indexes a run at the step limit in one pass', () => {
    const steps = Array.from({ length: 50_000 }, (_, seq) => step('', seq, seq % 2 ? 'Check' : 'Wait'))
    const started = performance.now()
    const outcomes = visitOutcomes(steps)
    expect(performance.now() - started).toBeLessThan(1000)
    expect(outcomes.get('|Check|24999')).toBe(steps[49_999])
  })
})
