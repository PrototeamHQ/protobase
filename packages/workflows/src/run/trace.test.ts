import { describe, expect, it } from 'vitest'
import type { Definition } from '../definition/types'
import { StepError } from './errors'
import { memoryRunner } from './memory-port'

const definition = (fails: boolean, trace?: Definition['trace']): Definition => ({
  trigger: { manual: {} },
  stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Call', States: { Call: { Type: 'Task', Resource: fails ? 'fail' : 'call', Arguments: { n: 1 }, Next: 'Hold' }, Hold: { Type: 'Wait', Seconds: 5, End: true } } },
  ...(trace && { trace }),
})
const tasks = { call: async () => 'ok', fail: async () => Promise.reject(new StepError('Remote.Down', 'down')) }

describe("a run's trace", () => {
  it('keeps every step of every segment, with its input and output, by default, a write in a part before its checkpoint', async () => {
    const port = memoryRunner(tasks)
    await port.start('r1', definition(false), {})
    await port.drain()
    expect(port.traces.get('r1')!.map((part) => part.map(({ state, input, output }) => ({ state, input, output })))).toEqual([
      [{ state: 'Call', input: { n: 1 }, output: 'ok' }],
      [{ state: 'Hold', input: 'ok', output: 'ok' }],
    ])
  })

  it('keeps a trace only for a run that fails when its workflow says failed', async () => {
    const port = memoryRunner(tasks)
    await port.start('passes', definition(false, 'failed'), {})
    await port.start('fails', definition(true, 'failed'), {})
    await port.drain()
    expect(port.traces.has('passes')).toBe(false)
    expect(port.traces.get('fails')!.flat().map(({ state, status }) => ({ state, status }))).toEqual([{ state: 'Call', status: 'failed' }])
  })

  it("keeps none when the workflow says none, and lets the run's own setting win over its workflow's and the app's", async () => {
    const port = memoryRunner(tasks, { traceMode: 'none' })
    await port.start('none', definition(false), {})
    await port.start('own', definition(false, 'none'), {}, 'all')
    await port.drain()
    expect(port.traces.has('none')).toBe(false)
    expect(port.traces.get('own')!.flat()).toHaveLength(2)
  })
})
