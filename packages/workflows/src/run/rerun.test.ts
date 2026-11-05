import { describe, expect, it } from 'vitest'
import type { Definition } from '../definition/types'
import { StepError } from './errors'
import { memoryRunner } from './memory-port'
import { rerunSteps } from './rerun'

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
