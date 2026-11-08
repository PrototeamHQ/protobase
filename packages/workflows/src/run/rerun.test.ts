import { describe, expect, it } from 'vitest'
import type { Definition } from '../definition/types'
import { StepError } from './errors'
import { memoryRunner } from './memory-port'
import type { StepRecord } from './port'
import { keptAssigned, rerunProblem } from './rerun'
import { rerunFrom } from './rerun-from'

const definition = (states: Definition['stateMachine']['States'], startAt = Object.keys(states)[0]!): Definition => ({
  trigger: { manual: {} },
  stateMachine: { QueryLanguage: 'JSONata', StartAt: startAt, States: states },
})
// A root step as a run's trace keeps it, read back as JSON
const traced = (fields: Pick<StepRecord, 'seq' | 'state' | 'next'> & Partial<StepRecord>): StepRecord => ({
  scope: '', type: 'Task', status: 'succeeded', attempt: 1, logs: [], startedAt: new Date('2026-11-08T11:00:00Z'), finishedAt: new Date('2026-11-08T11:00:01Z'), recorded: false, ...fields,
})
const of = (port: ReturnType<typeof memoryRunner>, runId: string) => port.steps.filter((step) => step.runId === runId).map(({ scope, seq, state, status }) => ({ scope, seq, state, status }))

describe('a re-run', () => {
  it('goes on from the last checkpoint of the fixed workflow, calling no write before it again', async () => {
    const calls: string[] = []
    let fixed = false
    const port = memoryRunner({
      fetch: async () => {
        calls.push('fetch')
        return { id: 7 }
      },
      store: async (args) => {
        calls.push('store')
        if (!fixed) throw new StepError('Store.Refused', 'no such table')
        return args
      },
    })
    const broken = definition({
      Fetch: { Type: 'Task', Resource: 'fetch', Assign: { id: '{% $states.result.id %}' }, Next: 'Store' },
      Store: { Type: 'Task', Resource: 'store', Arguments: { id: '{% $id %}' }, Retry: [{ ErrorEquals: ['States.ALL'], MaxAttempts: 1 }], End: true },
    })
    await port.start('r1', broken, { day: 'monday' })
    await port.drain()
    expect(port.run('r1')).toMatchObject({ status: 'failed', error: 'Store.Refused' })
    expect(calls).toEqual(['fetch', 'store', 'store'])

    fixed = true
    calls.length = 0
    await port.rerun('r2', 'r1', broken)
    await port.drain()
    expect(port.run('r2')).toMatchObject({ status: 'succeeded', output: { id: 7 }, input: { day: 'monday' } })
    expect(calls).toEqual(['store'])
    // It goes on from the retry's checkpoint, at the store's first try again.
    expect(of(port, 'r2')).toEqual([{ scope: '', seq: 2, state: 'Store', status: 'succeeded' }])
  })

  it("keeps a Map's finished items and runs again only the item that failed", async () => {
    const done: number[] = []
    let fixed = false
    const port = memoryRunner({
      handle: async (item) => {
        if (item === 2 && !fixed) throw new StepError('Item.Bad', 'item 2')
        done.push(item as number)
        return item
      },
    })
    const flow = definition({
      Each: { Type: 'Map', Items: '{% [1, 2, 3] %}', MaxConcurrency: 1, ItemProcessor: { StartAt: 'Handle', States: { Handle: { Type: 'Task', Resource: 'handle', Arguments: '{% $states.input %}', End: true } } }, End: true },
    })
    await port.start('r1', flow, {})
    await port.drain()
    expect(port.run('r1')).toMatchObject({ status: 'failed', error: 'Item.Bad' })
    expect(done).toEqual([1])

    fixed = true
    done.length = 0
    await port.rerun('r2', 'r1', flow)
    await port.drain()
    expect(port.run('r2')).toMatchObject({ status: 'succeeded', output: [1, 2, 3] })
    expect(done).toEqual([2, 3])
  })

  it('runs again the reads and pure steps since the last checkpoint, which come after its last write', async () => {
    const calls: string[] = []
    let fixed = false
    const port = memoryRunner({
      send: async () => void calls.push('send'),
      lookup: Object.assign(async () => void calls.push('lookup'), { writes: () => false }),
      store: async () => {
        calls.push('store')
        if (!fixed) throw new StepError('Store.Refused', 'no such table')
      },
    })
    const flow = definition({
      Send: { Type: 'Task', Resource: 'send', Next: 'Lookup' },
      Lookup: { Type: 'Task', Resource: 'lookup', Next: 'Store' },
      Store: { Type: 'Task', Resource: 'store', End: true },
    })
    await port.start('r1', flow, {})
    await port.drain()
    fixed = true
    calls.length = 0
    await port.rerun('r2', 'r1', flow)
    await port.drain()
    expect(port.run('r2')).toMatchObject({ status: 'succeeded' })
    expect(calls).toEqual(['lookup', 'store'])
  })

  it('refuses a run that would go on at a state the workflow no longer has', () => {
    const renamed = definition({ Fetch: { Type: 'Pass', Next: 'Save' }, Save: { Type: 'Succeed' } }).stateMachine
    expect(rerunProblem(renamed, [{ scope: '', next: 'Store' }])).toBe('The run goes on at state "Store", which the workflow no longer has')
  })

  it('refuses a Map item whose Map is gone, and keeps one that ended as it ran', () => {
    const flow = definition({ Other: { Type: 'Succeed' } }).stateMachine
    expect(rerunProblem(flow, [{ scope: 'Each.0[1]', next: 'Handle' }])).toBe('The run goes on in the Map "Each", which the workflow no longer has')
    expect(rerunProblem(flow, [{ scope: 'Each.0[0]', next: null }])).toBeUndefined()
  })
})

const byPlace = (a: { scope: string; seq: number }, b: { scope: string; seq: number }) => a.scope.localeCompare(b.scope) || a.seq - b.seq

describe('a re-run from a step', () => {
  const flow = definition({
    Fetch: { Type: 'Task', Resource: 'fetch', Assign: { id: '{% $states.result.id %}' }, Next: 'Each' },
    Each: { Type: 'Map', Items: '{% [1, 2] %}', ItemProcessor: { StartAt: 'One', States: { One: { Type: 'Task', Resource: 'one', End: true } } }, Next: 'Store' },
    Store: { Type: 'Task', Resource: 'store', Arguments: { id: '{% $id %}' }, End: true },
  })

  it('keeps what ran before the step, reads its variables, and runs that step and all after it again, on a run that succeeded too', async () => {
    const calls: string[] = []
    const call = (name: string) => async () => {
      calls.push(name)
      return { id: 7 }
    }
    const port = memoryRunner({ fetch: call('fetch'), one: call('one'), store: call('store') })
    await port.start('r1', flow, {})
    await port.drain()
    expect(port.run('r1').status).toBe('succeeded')
    calls.length = 0
    await port.rerun('r2', 'r1', flow, 'Store')
    await port.drain()
    expect(port.run('r2').status).toBe('succeeded')
    expect(calls).toEqual(['store'])
    // Its trace keeps the steps it kept, the Map's items among them, before the ones it ran
    expect(of(port, 'r2').sort(byPlace)).toEqual([
      { scope: '', seq: 0, state: 'Fetch', status: 'succeeded' },
      { scope: 'Each.1[0]', seq: 0, state: 'One', status: 'succeeded' },
      { scope: 'Each.1[1]', seq: 0, state: 'One', status: 'succeeded' },
      { scope: '', seq: 1, state: 'Each', status: 'succeeded' },
      { scope: '', seq: 2, state: 'Store', status: 'succeeded' },
    ].sort(byPlace))
    calls.length = 0
    await port.rerun('r3', 'r1', flow, 'Each')
    await port.drain()
    expect(port.run('r3').status).toBe('succeeded')
    expect(calls).toEqual(['one', 'one', 'store'])
    calls.length = 0
    await port.rerun('r4', 'r1', flow, 'Fetch')
    await port.drain()
    expect(calls.at(0)).toBe('fetch')
  })

  it('gives a later step the variable a kept step got since, from what that step gave, running it not again', async () => {
    const calls: string[] = []
    const port = memoryRunner({
      fetch: async () => {
        calls.push('fetch')
        return { id: 7 }
      },
      store: async (args) => {
        calls.push('store')
        return args
      },
    })
    const before = definition({ Fetch: { Type: 'Task', Resource: 'fetch', Next: 'Store' }, Store: { Type: 'Task', Resource: 'store', End: true } })
    await port.start('r1', before, {})
    await port.drain()
    const after = definition({ Fetch: { Type: 'Task', Resource: 'fetch', Assign: { fetched: '{% $states.result %}' }, Next: 'Store' }, Store: { Type: 'Task', Resource: 'store', Arguments: { id: '{% $fetched.id %}' }, End: true } })
    calls.length = 0
    await port.rerun('r2', 'r1', after, 'Store')
    await port.drain()
    expect(calls).toEqual(['store'])
    expect(port.run('r2')).toMatchObject({ status: 'succeeded', output: { id: 7 } })
  })

  it('refuses a state the run never reached, one the version no longer has, and a first step that is no longer first', () => {
    const steps = [traced({ seq: 0, state: 'Fetch', next: 'Each' })]
    const at = new Date('2026-11-08T12:00:00Z')
    expect(rerunFrom(flow.stateMachine, flow.stateMachine, steps, 'Store', at)).toEqual({ problem: 'The run never reached state "Store"' })
    expect(rerunFrom(definition({ Other: { Type: 'Succeed' } }).stateMachine, flow.stateMachine, steps, 'Fetch', at)).toEqual({ problem: 'The workflow no longer has state "Fetch"' })
    expect(rerunFrom(definition({ Other: { Type: 'Pass', Next: 'Fetch' }, Fetch: { Type: 'Succeed' } }).stateMachine, flow.stateMachine, steps, 'Fetch', at)).toEqual({ problem: 'The workflow no longer starts at state "Fetch"' })
  })

  it('re-runs a re-run from a state before the one it went on from, from the steps its trace kept', async () => {
    const calls: string[] = []
    const call = (name: string) => async () => void calls.push(name)
    const port = memoryRunner({ fetch: call('fetch'), one: call('one'), store: call('store') })
    await port.start('r1', flow, {})
    await port.drain()
    await port.rerun('r2', 'r1', flow, 'Store')
    await port.drain()
    calls.length = 0
    await port.rerun('r3', 'r2', flow, 'Each')
    await port.drain()
    expect(port.run('r3').status).toBe('succeeded')
    expect(calls).toEqual(['one', 'one', 'store'])
  })

  it('refuses a run that kept no trace', async () => {
    const port = memoryRunner({ fetch: async () => ({ id: 7 }), one: async () => 1, store: async () => 1 }, { traceMode: 'none' })
    await port.start('r1', flow, {})
    await port.drain()
    await expect(port.rerun('r2', 'r1', flow, 'Store')).rejects.toThrow('The run kept no trace')
  })

  it('refuses a trace that lacks steps before the state, as one of a re-run that went on from a checkpoint', () => {
    const steps = [traced({ seq: 2, state: 'Each', next: 'Store' }), traced({ seq: 3, state: 'Store', next: null })]
    expect(rerunFrom(flow.stateMachine, flow.stateMachine, steps, 'Store', new Date())).toEqual({ problem: 'The run\'s trace does not hold every step before state "Store"' })
  })

  it("starts at the state with the kept steps' variables and output, at the re-run's time, from its first try", () => {
    const steps = [
      traced({ seq: 0, state: 'Fetch', next: 'Each', output: { id: 7 }, assigned: { id: 7 }, recorded: true }),
      traced({ seq: 1, state: 'Each', type: 'Map', next: 'Store', output: [1, 2] }),
      traced({ seq: 1, state: 'Each', type: 'Map', next: 'Store', output: [1, 2] }),
      traced({ seq: 2, state: 'Store', next: null }),
    ]
    const at = new Date('2026-11-08T12:00:00Z')
    const found = rerunFrom(flow.stateMachine, flow.stateMachine, JSON.parse(JSON.stringify(steps)), 'Store', at)
    expect(found).toMatchObject({ checkpoint: { scope: '', seq: 1, next: 'Store', value: [1, 2], variables: { id: 7 }, attempt: 1, failures: [], visits: { Fetch: 1, Each: 1 }, clock: at, after: -1 } })
    // A step a crash made run again is kept once
    expect('kept' in found && found.kept.map((step) => step.seq)).toEqual([0, 1])
  })
})

describe('keptAssigned', () => {
  const machine = definition({ Fetch: { Type: 'Task', Resource: 'fetch', Assign: { whole: '{% $states.result %}', id: '{% $states.result.id %}' }, End: true } }).stateMachine
  const step = { scope: '', state: 'Fetch', status: 'succeeded', output: { id: 7, name: 'Ada' } }

  it('gives a variable that keeps the whole result that result, whatever the step assigned it then, and keeps the others as they ran', () => {
    expect(keptAssigned(machine, machine, { ...step, assigned: { whole: 7, id: 7 } })).toEqual({ whole: { id: 7, name: 'Ada' }, id: 7 })
    expect(keptAssigned(machine, machine, { ...step, assigned: null })).toEqual({ whole: { id: 7, name: 'Ada' } })
  })

  it('reads the whole result however the expression is spaced', () => {
    const spaced = definition({ Fetch: { Type: 'Task', Resource: 'fetch', Assign: { whole: '{%  $states.result %}' }, End: true } }).stateMachine
    expect(keptAssigned(spaced, spaced, { ...step, assigned: null })).toEqual({ whole: { id: 7, name: 'Ada' } })
  })

  it('keeps what a step that failed into a catcher assigned', () => {
    expect(keptAssigned(machine, machine, { ...step, status: 'caught', output: { Error: 'Fetch.Refused' }, assigned: { whole: 'fallback' } })).toBeUndefined()
  })

  it('changes nothing that already holds the result, nor a state that shapes its result', () => {
    expect(keptAssigned(machine, machine, { ...step, assigned: { whole: { id: 7, name: 'Ada' }, id: 7 } })).toBeUndefined()
    const shaped = definition({ Fetch: { Type: 'Task', Resource: 'fetch', Output: '{% $states.result.id %}', Assign: { whole: '{% $states.result %}' }, End: true } }).stateMachine
    expect(keptAssigned(shaped, shaped, { ...step, assigned: null })).toBeUndefined()
    // Shaped in the run it keeps from, its output is not its whole result, so nothing is made of it
    expect(keptAssigned(machine, shaped, { ...step, output: 7, assigned: { whole: { id: 7, name: 'Ada' } } })).toBeUndefined()
  })
})
