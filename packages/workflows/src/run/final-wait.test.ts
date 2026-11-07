import { describe, expect, it } from 'vitest'
import type { Definition } from '../definition/types'
import { memoryRunner } from './memory-port'
import type { TaskHandler } from './port'

const definition = (states: Definition['stateMachine']['States'], startAt = Object.keys(states)[0]!): Definition => ({
  trigger: { manual: {} },
  stateMachine: { QueryLanguage: 'JSONata', StartAt: startAt, States: states },
})

const reads = (run: (args: unknown) => Promise<unknown>): TaskHandler => Object.assign(run, { writes: () => false })

describe('a Wait that ends its scope', () => {
  it('holds the run until its time, then ends it with its output', async () => {
    let calls = 0
    const port = memoryRunner({ fetch: async () => ({ calls: ++calls }) })
    await port.start('r1', definition({
      Fetch: { Type: 'Task', Resource: 'fetch', Next: 'Hold' },
      Hold: { Type: 'Wait', Seconds: 3600, End: true },
    }), {})
    await port.step()
    expect(port.run('r1')).toMatchObject({ status: 'waiting', resumeAt: new Date('2026-11-04T13:00:00Z') })

    // A segment that wakes early leaves the run waiting.
    await port.runner.segment(null, 'r1', new AbortController().signal)
    expect(port.run('r1')).toMatchObject({ status: 'waiting', resumeAt: new Date('2026-11-04T13:00:00Z') })

    await port.drain()
    expect(port.now()).toEqual(new Date('2026-11-04T13:00:00Z'))
    expect(port.run('r1')).toMatchObject({ status: 'succeeded', output: { calls: 1 } })
    expect(calls).toBe(1)
  })

  it('ends the run at once when its time has already passed', async () => {
    const port = memoryRunner({})
    const before = port.now()
    await port.start('r1', definition({ Hold: { Type: 'Wait', Seconds: 0, End: true } }), { a: 1 })
    await port.start('r2', definition({ Hold: { Type: 'Wait', Timestamp: '2026-01-01T00:00:00Z', End: true } }), { b: 2 })
    await port.drain()
    expect(port.run('r1')).toMatchObject({ status: 'succeeded', output: { a: 1 } })
    expect(port.run('r2')).toMatchObject({ status: 'succeeded', output: { b: 2 } })
    expect(port.now()).toEqual(before)
  })

  it("holds a Map whose item ends with it, so the state after the Map runs only once it passed", async () => {
    const after: Date[] = []
    const port = memoryRunner({ after: async () => void after.push(port.now()) })
    await port.start('r1', definition({
      Each: {
        Type: 'Map',
        Items: '{% [1, 2] %}',
        ItemProcessor: { StartAt: 'Pause', States: { Pause: { Type: 'Wait', Seconds: 60, End: true } } },
        Next: 'After',
      },
      After: { Type: 'Task', Resource: 'after', End: true },
    }), {})
    await port.step()
    expect(port.run('r1')).toMatchObject({ status: 'waiting', resumeAt: new Date('2026-11-04T12:01:00Z') })
    expect(after).toEqual([])

    await port.drain()
    expect(after).toEqual([new Date('2026-11-04T12:01:00Z')])
    expect(port.steps.find((step) => step.state === 'Each')).toMatchObject({ output: [1, 2] })
    expect(port.run('r1').status).toBe('succeeded')
  })

  it('does not wait in a replay, which ends at once', async () => {
    const port = memoryRunner({ fetch: reads(async () => 'fetched') })
    const flow = definition({
      Fetch: { Type: 'Task', Resource: 'fetch', Next: 'Hold' },
      Hold: { Type: 'Wait', Seconds: 3600, End: true },
    })
    await port.start('r1', flow, {})
    await port.drain()
    const before = port.now()
    await port.replay('r2', 'r1', flow)
    await port.drain()
    expect(port.now()).toEqual(before)
    expect(port.run('r2')).toMatchObject({ status: 'succeeded', output: 'fetched' })
  })
})
