import { describe, expect, it } from 'vitest'
import type { Definition } from '../definition/types'
import { memoryRunner } from './memory-port'
import type { TaskHandler } from './port'
import { StepError } from './errors'
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

  it('gives each held-back step in a Map that starts the run what the replayed item step gave', async () => {
    const sent: unknown[] = []
    const port = memoryRunner({ send: async (args) => (sent.push(args), { message_id: `m-${sent.length}` }) })
    const flow = definition({
      Each: {
        Type: 'Map',
        Items: '{% [1, 2] %}',
        ItemProcessor: { StartAt: 'Send', States: { Send: { Type: 'Task', Resource: 'send', Arguments: { n: '{% $states.input %}' }, End: true } } },
        End: true,
      },
    })
    await port.start('r1', flow, {})
    await port.drain()
    const original = port.steps.filter((step) => step.runId === 'r1' && step.state === 'Send').map((step) => step.output)
    await port.replay('r2', 'r1', flow)
    await port.drain()
    expect(sent).toHaveLength(2)
    const replayed = port.steps.filter((step) => step.runId === 'r2' && step.state === 'Send').map((step) => step.output)
    expect(replayed).toEqual(original)
    expect(port.run('r2')).toMatchObject({ status: 'succeeded', output: port.run('r1')!.output })
  })

  it('matches each visit of a loop across segments, from the visits its checkpoints keep', async () => {
    const sent: unknown[] = []
    const slow = reads(async () => new Promise((resolve) => setTimeout(() => resolve(true), 5)))
    const port = memoryRunner({ read: slow, send: async (args) => (sent.push(args), { message_id: `m-${sent.length}` }) }, { budgetMs: 1 })
    const flow = definition({
      Count: { Type: 'Pass', Assign: { n: '{% $exists($n) ? $n + 1 : 1 %}' }, Next: 'Read' },
      Read: { Type: 'Task', Resource: 'read', Next: 'Send' },
      Send: { Type: 'Task', Resource: 'send', Arguments: { n: '{% $n %}' }, Next: 'Again' },
      Again: { Type: 'Choice', Choices: [{ Condition: '{% $n < 3 %}', Next: 'Count' }], Default: 'Done' },
      Done: { Type: 'Succeed' },
    })
    await port.start('r1', flow, {})
    await port.drain()
    await port.replay('r2', 'r1', flow)
    await port.drain()
    expect(sent).toHaveLength(3)
    const outputs = (runId: string) => port.steps.filter((step) => step.runId === runId && step.state === 'Send').map((step) => step.output)
    expect(outputs('r2')).toEqual([{ message_id: 'm-1' }, { message_id: 'm-2' }, { message_id: 'm-3' }])
    expect(port.traces.get('r2')!.length).toBeGreaterThan(1)
  })

  it('runs no state when the trace it replays cannot be read', async () => {
    const calls: unknown[] = []
    const flow = definition({ Send: { Type: 'Task', Resource: 'send', End: true } })
    const runner = createRunner<null>({
      store: {
        load: async () => ({ id: 'r2', definition: flow, input: {}, status: 'queued', startedAt: new Date(), replayOf: { id: 'r1', definition: flow } }),
        checkpoints: async () => [],
        save: async () => true,
        update: async () => {},
      },
      queue: { schedule: async () => {}, wake: async () => {} },
      tasks: { send: async (args) => void calls.push(args) },
      trace: { write: async () => {}, read: () => Promise.reject(new Error('connection lost')) },
    })
    await expect(runner.segment(null, 'r2', new AbortController().signal)).rejects.toThrow('connection lost')
    expect(calls).toEqual([])
  })

  describe('on a newer version', () => {
    const replayed = (port: ReturnType<typeof memoryRunner>, state: string) => port.steps.filter((step) => step.runId === 'r2' && step.state === state)

    it('composes as the newer version does, matches held-back steps by state past an inserted one, and gives an added one null', async () => {
      const sent: unknown[] = []
      const looked: unknown[] = []
      const port = memoryRunner({
        lookup: reads(async (args) => (looked.push(args), { price: 10 })),
        send: async (args) => (sent.push(args), { message_id: `m-${sent.length}` }),
        audit: async () => ({ logged: true }),
      })
      const lookup = (sku: string) => ({ Type: 'Task' as const, Resource: 'lookup', Arguments: { sku }, Assign: { price: '{% $states.result.price %}' } })
      const first = definition({
        Lookup: { ...lookup('A1'), Next: 'Compose' },
        Compose: { Type: 'Pass', Output: { text: '{% "Price: " & $price %}' }, Next: 'Send' },
        Send: { Type: 'Task', Resource: 'send', Arguments: { text: '{% $states.input.text %}' }, End: true },
      })
      await port.start('r1', first, {})
      await port.drain()
      looked.length = 0

      const fixed = definition({
        Lookup: { ...lookup('B2'), Next: 'Compose' },
        Compose: { Type: 'Pass', Output: { text: '{% "Price: " & $price %}' }, Next: 'Sign' },
        Sign: { Type: 'Pass', Output: { text: '{% $states.input.text & " EUR" %}' }, Next: 'Send' },
        Send: { Type: 'Task', Resource: 'send', Arguments: { text: '{% $states.input.text %}' }, Assign: { id: '{% $states.result.message_id %}' }, Next: 'Audit' },
        Audit: { Type: 'Task', Resource: 'audit', End: true },
      })
      await port.replay('r2', 'r1', fixed)
      await port.drain()
      expect(sent).toEqual([{ text: 'Price: 10' }])
      expect(looked).toEqual([{ sku: 'B2' }])
      expect(replayed(port, 'Audit')[0]).toMatchObject({ output: null, logs: [{ message: 'Not sent: replay' }] })
      expect(replayed(port, 'Send')[0]).toMatchObject({ input: { text: 'Price: 10 EUR' }, output: { message_id: 'm-1' }, assigned: { id: 'm-1' } })
    })

    it('gives the visit of a state its own result, after retries and in Map items behind an added state', async () => {
      let tries = 0
      const port = memoryRunner({
        send: async (args) => {
          if (++tries === 1) throw new StepError('Busy', 'try again')
          return { sent: args }
        },
        read: reads(async () => ({})),
      })
      const each = (states: Definition['stateMachine']['States'], startAt: string) => ({
        Type: 'Map' as const,
        Items: '{% [1, 2] %}',
        ItemProcessor: { StartAt: startAt, States: states },
        End: true,
      })
      const send = { Type: 'Task' as const, Resource: 'send', Arguments: { n: '{% $states.input %}' }, Retry: [{ ErrorEquals: ['Busy'], IntervalSeconds: 1 }], End: true }
      await port.start('r1', definition({ Each: each({ Send: send }, 'Send') }), {})
      await port.drain()
      expect(port.run('r1')).toMatchObject({ status: 'succeeded' })

      const before = port.now()
      const fixed = definition({ Read: { Type: 'Task', Resource: 'read', Next: 'Each' }, Each: each({ Read: { Type: 'Task', Resource: 'read', Next: 'Send' }, Send: send }, 'Read') })
      await port.replay('r2', 'r1', fixed)
      await port.drain()
      expect(tries).toBe(3)
      expect(port.run('r2')).toMatchObject({ status: 'succeeded', output: [{ sent: { n: 1 } }, { sent: { n: 2 } }] })
      expect(port.now()).toEqual(before)
    })

    it('gives null where the replayed run shaped its result with Output, or its state was no Task, and shapes an unshaped one anew', async () => {
      const port = memoryRunner({ send: async () => ({ id: 'm-1', at: 'noon' }) })
      const first = definition({
        Shaped: { Type: 'Task', Resource: 'send', Output: '{% $states.result.id %}', Next: 'Plain' },
        Plain: { Type: 'Task', Resource: 'send', Next: 'Was' },
        Was: { Type: 'Pass', Output: { id: 'p' }, End: true },
      })
      await port.start('r1', first, {})
      await port.drain()
      const fixed = definition({
        Shaped: { Type: 'Task', Resource: 'send', Output: '{% $states.result %}', Next: 'Plain' },
        Plain: { Type: 'Task', Resource: 'send', Output: '{% $states.result.at %}', Next: 'Was' },
        Was: { Type: 'Task', Resource: 'send', End: true },
      })
      await port.replay('r2', 'r1', fixed)
      await port.drain()
      expect(['Shaped', 'Plain', 'Was'].map((state) => replayed(port, state)[0]!.output)).toEqual([null, 'noon', null])
    })

    it("fails a held-back step with the replayed run's error, which the newer version's Catch takes without retrying", async () => {
      const port = memoryRunner({ send: async () => Promise.reject(new StepError('Refused', 'no such mailbox')) })
      await port.start('r1', definition({ Send: { Type: 'Task', Resource: 'send', End: true } }), {})
      await port.drain()
      expect(port.run('r1')).toMatchObject({ status: 'failed', error: 'Refused' })

      const before = port.now()
      const fixed = definition({
        Send: { Type: 'Task', Resource: 'send', Retry: [{ ErrorEquals: ['Refused'], IntervalSeconds: 60 }], Catch: [{ ErrorEquals: ['Refused'], Next: 'Report' }], End: true },
        Report: { Type: 'Pass', Output: '{% $states.input.Cause %}', End: true },
      })
      await port.replay('r2', 'r1', fixed)
      await port.drain()
      expect(replayed(port, 'Send')).toMatchObject([{ status: 'caught', error: 'Refused', cause: 'no such mailbox' }])
      expect(port.run('r2')).toMatchObject({ status: 'succeeded', output: 'no such mailbox' })
      expect(port.now()).toEqual(before)
    })
  })
})
