import { describe, expect, it } from 'vitest'
import type { Definition } from '../definition/types'
import { StepError } from './errors'
import { memoryRunner } from './memory-port'
import { keptAssigned, rerunFromSteps, rerunSteps } from './rerun'

const definition = (states: Definition['stateMachine']['States'], startAt = Object.keys(states)[0]!): Definition => ({
  trigger: { manual: {} },
  stateMachine: { QueryLanguage: 'JSONata', StartAt: startAt, States: states },
})
const of = (port: ReturnType<typeof memoryRunner>, runId: string) => port.steps.filter((step) => step.runId === runId).map(({ scope, seq, state, status }) => ({ scope, seq, state, status }))

describe('a re-run', () => {
  it('goes on from the failed step of the fixed workflow, keeping the steps before it and running none of them again', async () => {
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
    expect(of(port, 'r2')).toEqual([
      { scope: '', seq: 0, state: 'Fetch', status: 'succeeded' },
      { scope: '', seq: 1, state: 'Store', status: 'succeeded' },
    ])
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

  it('refuses a run that would go on at a state the workflow no longer has', () => {
    const steps = [
      { scope: '', seq: 0, state: 'Fetch', status: 'succeeded' as const, next: 'Store' },
      { scope: '', seq: 1, state: 'Store', status: 'failed' as const, next: null },
    ]
    const renamed = definition({ Fetch: { Type: 'Pass', Next: 'Save' }, Save: { Type: 'Succeed' } }).stateMachine
    expect(rerunSteps(renamed, steps)).toEqual({ problem: 'The run goes on at state "Store", which the workflow no longer has' })
  })

  it("drops the items of a Map's earlier tries when the Map runs again", () => {
    const steps = [
      { scope: '', seq: 0, state: 'Each', status: 'retrying' as const, next: null },
      { scope: 'Each.0[0]', seq: 0, state: 'Handle', status: 'failed' as const, next: null },
      { scope: '', seq: 1, state: 'Each', status: 'failed' as const, next: null },
      { scope: 'Each.1[0]', seq: 0, state: 'Handle', status: 'failed' as const, next: null },
    ]
    const flow = definition({ Each: { Type: 'Map', Items: '{% [1] %}', ItemProcessor: { StartAt: 'Handle', States: { Handle: { Type: 'Pass', End: true } } }, End: true } }).stateMachine
    expect(rerunSteps(flow, steps)).toEqual({ steps: [] })
  })
})

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
    const steps = [{ scope: '', seq: 0, state: 'Fetch', status: 'succeeded' as const, next: 'Each' }]
    expect(rerunFromSteps(flow.stateMachine, steps, 'Store')).toEqual({ problem: 'The run never reached state "Store"' })
    expect(rerunFromSteps(definition({ Other: { Type: 'Succeed' } }).stateMachine, steps, 'Fetch')).toEqual({ problem: 'The workflow no longer has state "Fetch"' })
    expect(rerunFromSteps(definition({ Other: { Type: 'Pass', Next: 'Fetch' }, Fetch: { Type: 'Succeed' } }).stateMachine, steps, 'Fetch')).toEqual({ problem: 'The workflow no longer starts at state "Fetch"' })
  })
})

describe('keptAssigned', () => {
  const machine = definition({ Fetch: { Type: 'Task', Resource: 'fetch', Assign: { whole: '{% $states.result %}', id: '{% $states.result.id %}' }, End: true } }).stateMachine
  const step = { scope: '', state: 'Fetch', status: 'succeeded', output: { id: 7, name: 'Ada' } }

  it('gives a variable that keeps the whole result that result, whatever the step assigned it then, and keeps the others as they ran', () => {
    expect(keptAssigned(machine, { ...step, assigned: { whole: 7, id: 7 } })).toEqual({ whole: { id: 7, name: 'Ada' }, id: 7 })
    expect(keptAssigned(machine, { ...step, assigned: null })).toEqual({ whole: { id: 7, name: 'Ada' } })
  })

  it('keeps what a step that failed into a catcher assigned', () => {
    expect(keptAssigned(machine, { ...step, status: 'caught', output: { Error: 'Fetch.Refused' }, assigned: { whole: 'fallback' } })).toBeUndefined()
  })

  it('changes nothing that already holds the result, nor a state that shapes its result', () => {
    expect(keptAssigned(machine, { ...step, assigned: { whole: { id: 7, name: 'Ada' }, id: 7 } })).toBeUndefined()
    const shaped = definition({ Fetch: { Type: 'Task', Resource: 'fetch', Output: '{% $states.result.id %}', Assign: { whole: '{% $states.result %}' }, End: true } }).stateMachine
    expect(keptAssigned(shaped, { ...step, assigned: null })).toBeUndefined()
  })
})
