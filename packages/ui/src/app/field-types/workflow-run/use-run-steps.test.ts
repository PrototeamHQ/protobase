import { describe, expect, it } from 'vitest'
import { followedSteps, stepRow } from './use-run-steps'

describe('stepRow', () => {
  it("keys a trace's step by its scope and number, with its timing as the run's page shows it", () => {
    const step = { scope: 'Each.3[0]', seq: 2, state: 'Fetch', type: 'Task', status: 'succeeded' as const, attempt: 1, next: null, logs: [], startedAt: '2026-11-07T10:00:00.000Z', finishedAt: '2026-11-07T10:00:01.250Z', recorded: false }
    expect(stepRow(step)).toMatchObject({ id: 'Each.3[0]#2', state: 'Fetch', started_at: step.startedAt, finished_at: step.finishedAt, duration_ms: 1250, resume_at: null })
  })
})

describe('followedSteps', () => {
  const step = (seq: number) => ({ scope: '', seq, state: 'Fetch', type: 'Task', status: 'succeeded' as const, attempt: 1, next: null, logs: [], startedAt: '2026-11-07T10:00:00.000Z', finishedAt: '2026-11-07T10:00:01.000Z', recorded: false })
  const have = [stepRow(step(0)), stepRow(step(1))]

  it('adds the steps a read after those the page has gave, and takes the whole trace when it starts again from 0', () => {
    expect(followedSteps(have, { from: 2, steps: [step(2)], revision: 'r3' })).toEqual({ rows: [...have, stepRow(step(2))], revision: 'r3' })
    expect(followedSteps(have, { from: 2, steps: [], revision: 'r2' })).toEqual({ rows: have, revision: 'r2' })
    expect(followedSteps(have, { from: 0, steps: [], revision: 'r0' })).toEqual({ rows: [], revision: 'r0' })
  })
})
