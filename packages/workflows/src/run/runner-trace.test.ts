import { describe, expect, it } from 'vitest'
import type { Definition } from '../definition/types'
import { createRunner } from './runner'

const definition = (states: Definition['stateMachine']['States']): Definition => ({
  trigger: { manual: {} },
  stateMachine: { QueryLanguage: 'JSONata', StartAt: Object.keys(states)[0]!, States: states },
})
const waits = definition({ Pause: { Type: 'Wait', Seconds: 60, Next: 'Done' }, Done: { Type: 'Pass', End: true } })
const ends = definition({ Done: { Type: 'Pass', End: true } })

// A runner whose trace takes a moment to keep each part, logging when it is kept against what the run does next.
const runnerLogging = (events: string[], flow: Definition) =>
  createRunner<null>({
    store: {
      load: async () => ({ id: 'r1', definition: flow, input: {}, status: 'queued', startedAt: new Date('2026-11-04T12:00:00Z') }),
      checkpoints: async () => [],
      save: async () => true,
      update: async (_, __, change) => void events.push(`status ${change.status}`),
    },
    queue: { schedule: async () => void events.push('scheduled') },
    tasks: {},
    trace: {
      write: async (_, __, { ended }) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        events.push(ended ? `trace joined ${ended}` : 'trace part kept')
      },
      read: async () => undefined,
    },
  })

describe("the runner's trace", () => {
  it("keeps a segment's part before the run waits and the next segment is queued", async () => {
    const events: string[] = []
    await runnerLogging(events, waits).segment(null, 'r1', new AbortController().signal)
    expect(events).toEqual(['status running', 'trace part kept', 'status waiting', 'scheduled'])
  })

  it('joins the whole trace before the run is marked ended, so a run seen ended has all of it', async () => {
    const events: string[] = []
    await runnerLogging(events, ends).segment(null, 'r1', new AbortController().signal)
    expect(events).toEqual(['status running', 'trace joined succeeded', 'status succeeded'])
  })
})
