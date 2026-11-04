import { describe, expect, it } from 'vitest'
import type { Definition } from '../definition/types'
import { memoryRunner } from './memory-port'

const definition = (states: Definition['stateMachine']['States'], startAt = Object.keys(states)[0]!): Definition => ({
  trigger: { manual: {} },
  stateMachine: { QueryLanguage: 'JSONata', StartAt: startAt, States: states },
})
const keys = (steps: { scope: string; seq: number; state: string }[]) => steps.map(({ scope, seq, state }) => `${scope}/${seq}/${state}`)

describe('when the runner saves steps', () => {
  it('saves a run of only steps without effects in one write at its end', async () => {
    const port = memoryRunner({})
    await port.start('r1', definition({
      Start: { Type: 'Pass', Output: 1, Next: 'Check' },
      Check: { Type: 'Choice', Choices: [{ Condition: '{% $states.input = 1 %}', Next: 'Done' }], Default: 'Done' },
      Done: { Type: 'Succeed' },
    }), {})
    await port.drain()

    expect(port.run('r1').status).toBe('succeeded')
    expect(port.writes).toEqual([3])
    expect(keys(port.steps)).toEqual(['/0/Start', '/1/Check', '/2/Done'])
  })

  it("saves a Task's step, with the steps kept before it, before the next state runs", async () => {
    let seen: string[] = []
    const port = memoryRunner({
      first: async () => 'one',
      second: async () => {
        seen = keys(port.steps)
        return 'two'
      },
    })
    await port.start('r2', definition({
      Before: { Type: 'Pass', Next: 'First' },
      First: { Type: 'Task', Resource: 'first', Next: 'Between' },
      Between: { Type: 'Pass', Next: 'Second' },
      Second: { Type: 'Task', Resource: 'second', End: true },
    }), {})
    await port.drain()

    expect(seen).toEqual(['/0/Before', '/1/First'])
    expect(port.writes).toEqual([2, 2])
    expect(keys(port.steps)).toEqual(['/0/Before', '/1/First', '/2/Between', '/3/Second'])
  })

  it('runs again the steps a segment kept but did not save before it died, and records the same steps', async () => {
    const worker = new AbortController()
    let calls = 0
    const port = memoryRunner({
      call: async (args) => {
        calls++
        if (calls > 1) return args
        worker.abort(new Error('The worker stopped'))
        throw worker.signal.reason
      },
    })
    const states: Definition['stateMachine']['States'] = {
      Shape: { Type: 'Pass', Output: { n: 2 }, Next: 'Pick' },
      Pick: { Type: 'Choice', Choices: [{ Condition: '{% $states.input.n > 1 %}', Output: '{% $states.input.n * 10 %}', Next: 'Call' }], Default: 'Call' },
      Call: { Type: 'Task', Resource: 'call', Arguments: { value: '{% $states.input %}' }, Next: 'Done' },
      Done: { Type: 'Succeed' },
    }
    await port.start('r3', definition(states), {})
    await expect(port.step(worker.signal)).rejects.toThrow('The worker stopped')
    expect(port.steps).toEqual([])

    await port.runner.start(null, 'r3')
    await port.drain()

    const clean = memoryRunner({ call: async (args) => args })
    await clean.start('r3', definition(states), {})
    await clean.drain()
    const recorded = (steps: typeof port.steps) => steps.map(({ startedAt: _, finishedAt: __, logs, ...step }) => ({ ...step, logs: logs.map(({ message }) => message) }))
    expect(port.run('r3')).toMatchObject({ status: 'succeeded', output: { value: 20 } })
    expect(calls).toBe(2)
    expect(recorded(port.steps)).toEqual(recorded(clean.steps))
  })

  it("writes a Map's item steps with the next checkpoint rather than one by one", async () => {
    const port = memoryRunner({ total: async (args) => args })
    await port.start('r4', definition({
      Each: { Type: 'Map', Items: '{% [1, 2, 3] %}', ItemProcessor: { StartAt: 'Double', States: { Double: { Type: 'Pass', Output: '{% $states.input * 2 %}', End: true } } }, Next: 'Total' },
      Total: { Type: 'Task', Resource: 'total', Arguments: { sum: '{% $sum($states.input) %}' }, End: true },
    }), {})
    await port.drain()

    expect(port.run('r4')).toMatchObject({ status: 'succeeded', output: { sum: 12 } })
    expect(port.writes).toEqual([5])
    expect(keys(port.steps)).toEqual(['Each.0[0]/0/Double', 'Each.0[1]/0/Double', 'Each.0[2]/0/Double', '/0/Each', '/1/Total'])
  })
})
