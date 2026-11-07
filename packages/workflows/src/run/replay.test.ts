import { describe, expect, it } from 'vitest'
import type { Definition } from '../definition/types'
import { memoryRunner } from './memory-port'
import type { TaskHandler } from './port'
import { createRunner } from './runner'

const definition = (states: Definition['stateMachine']['States'], startAt = Object.keys(states)[0]!): Definition => ({
  trigger: { manual: {} },
  stateMachine: { QueryLanguage: 'JSONata', StartAt: startAt, States: states },
})

const reads = (run: (args: unknown) => Promise<unknown>): TaskHandler => Object.assign(run, { writes: () => false })

describe('a replay', () => {
  it('calls no step that writes, gives what the replayed step gave, and runs the reads and in-memory states', async () => {
    const sent: unknown[] = []
    let price = 10
    const port = memoryRunner({
      lookup: reads(async () => ({ price })),
      send: async (args) => {
        sent.push(args)
        return { message_id: 'm-1' }
      },
    })
    const flow = definition({
      Lookup: { Type: 'Task', Resource: 'lookup', Assign: { price: '{% $states.result.price %}' }, Next: 'Compose' },
      Compose: { Type: 'Pass', Output: { text: '{% "Price: " & $price %}' }, Next: 'Pause' },
      Pause: { Type: 'Wait', Seconds: 3600, Next: 'Send' },
      Send: { Type: 'Task', Resource: 'send', Arguments: { text: '{% $states.input.text %}' }, Assign: { sent: '{% $states.result.message_id %}' }, End: true },
    })
    await port.start('r1', flow, {})
    await port.drain()
    expect(sent).toEqual([{ text: 'Price: 10' }])

    price = 12
    const before = port.now()
    await port.replay('r2', 'r1', flow)
    await port.drain()
    expect(sent).toHaveLength(1)
    expect(port.now()).toEqual(before)
    const steps = port.steps.filter((step) => step.runId === 'r2')
    expect(steps.map(({ state, output }) => ({ state, output }))).toEqual([
      { state: 'Lookup', output: { price: 12 } },
      { state: 'Compose', output: { text: 'Price: 12' } },
      { state: 'Pause', output: { text: 'Price: 12' } },
      { state: 'Send', output: { message_id: 'm-1' } },
    ])
    expect(steps[2]!.resumeAt).toBeUndefined()
    expect(steps[3]).toMatchObject({ input: { text: 'Price: 12' }, assigned: { sent: 'm-1' }, logs: [{ message: 'Not sent: replay' }] })
    expect(port.run('r2')).toMatchObject({ status: 'succeeded', output: { message_id: 'm-1' } })
  })

  it('holds back a writing step the replayed run never reached, whose output is null', async () => {
    const sent: unknown[] = []
    let flag = false
    const port = memoryRunner({
      check: reads(async () => ({ flag })),
      alert: async (args) => void sent.push(args),
    })
    const flow = definition({
      Check: { Type: 'Task', Resource: 'check', Next: 'Branch' },
      Branch: { Type: 'Choice', Choices: [{ Condition: '{% $states.input.flag %}', Next: 'Alert' }], Default: 'Done' },
      Alert: { Type: 'Task', Resource: 'alert', Arguments: { at: 'now' }, End: true },
      Done: { Type: 'Succeed' },
    })
    await port.start('r1', flow, {})
    await port.drain()
    flag = true
    await port.replay('r2', 'r1', flow)
    await port.drain()
    expect(sent).toEqual([])
    const alert = port.steps.find((step) => step.runId === 'r2' && step.state === 'Alert')
    expect(alert).toMatchObject({ status: 'succeeded', output: null, logs: [{ message: 'Not sent: replay' }] })
  })

  it('holds back a step whose type says nothing of writing, or whose writes check gives no boolean, in each Map item', async () => {
    const calls: unknown[] = []
    const port = memoryRunner({
      plain: async (args) => (calls.push(args), args),
      unsure: Object.assign(async (args: unknown) => (calls.push(args), args), { writes: () => 'no' as never }),
    })
    const flow = definition({
      Each: {
        Type: 'Map',
        Items: '{% [1, 2] %}',
        ItemProcessor: { StartAt: 'Plain', States: { Plain: { Type: 'Task', Resource: 'plain', Arguments: '{% $states.input %}', Next: 'Unsure' }, Unsure: { Type: 'Task', Resource: 'unsure', Arguments: { n: 1 }, End: true } } },
        End: true,
      },
    })
    await port.start('r1', flow, {})
    await port.drain()
    calls.length = 0
    await port.replay('r2', 'r1', flow)
    await port.drain()
    expect(calls).toEqual([])
    expect(port.run('r2')).toMatchObject({ status: 'succeeded' })
  })

  it('runs no state when the trace it replays cannot be read', async () => {
    const calls: unknown[] = []
    const flow = definition({ Send: { Type: 'Task', Resource: 'send', End: true } })
    const runner = createRunner<null>({
      store: {
        load: async () => ({ id: 'r2', definition: flow, input: {}, status: 'queued', startedAt: new Date(), replayOf: 'r1' }),
        checkpoints: async () => [],
        save: async () => true,
        update: async () => {},
      },
      queue: { schedule: async () => {} },
      tasks: { send: async (args) => void calls.push(args) },
      trace: { write: () => {}, read: () => Promise.reject(new Error('connection lost')) },
    })
    await expect(runner.segment(null, 'r2', new AbortController().signal)).rejects.toThrow('connection lost')
    expect(calls).toEqual([])
  })
})
