import { describe, expect, it } from 'vitest'
import type { Definition } from '../definition/types'
import { StepError } from './errors'
import { memoryRunner } from './memory-port'

const flow = (states: Record<string, unknown>): Definition => ({ trigger: { manual: {} }, order: 'data', stateMachine: { QueryLanguage: 'JSONata', States: states } as never })

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

describe('dataflow order', () => {
  it('runs the states that read nothing of each other at once, and a state once those it reads from have ended', async () => {
    const started: string[] = []
    const both = deferred()
    const port = memoryRunner({
      get: async (args) => {
        const { name } = args as { name: string }
        started.push(name)
        // Each request waits for the other to have started: only states running at once get past it
        if (started.length === 2) both.resolve()
        await both.promise
        return { value: name }
      },
      save: async (args) => args,
    })
    await port.start('r1', flow({
      Save: { Type: 'Task', Resource: 'save', Arguments: { joined: '{% $a.value & "+" & $b.value %}' } },
      A: { Type: 'Task', Resource: 'get', Arguments: { name: 'a' }, Assign: { a: '{% $states.result %}' } },
      B: { Type: 'Task', Resource: 'get', Arguments: { name: 'b' }, Assign: { b: '{% $states.result %}' } },
    }), {})
    await port.drain()
    expect(port.run('r1')).toMatchObject({ status: 'succeeded', output: { joined: 'a+b' } })
    expect(started.sort()).toEqual(['a', 'b'])
    expect(port.steps.map((step) => [step.scope, step.state, step.status])).toEqual(expect.arrayContaining([['A', 'A', 'succeeded'], ['B', 'B', 'succeeded'], ['Save', 'Save', 'succeeded']]))
  })

  it('runs a state on a Condition reading another state\'s Status, and skips it when the Condition is false', async () => {
    const sent: unknown[] = []
    const port = memoryRunner({ save: async () => ({ id: 1 }), mail: async (args) => (sent.push(args), { ok: true }) })
    const definition = (wanted: string) => flow({
      Save: { Type: 'Task', Resource: 'save', Assign: { saved: '{% $states.result %}' } },
      Mail: { Type: 'Task', Resource: 'mail', Condition: `{% $states.context.Steps.Save.Status = '${wanted}' %}`, Arguments: { text: 'saved' } },
      // A Condition that reads the Status takes the default skip away, so this runs whatever Mail did
      Done: { Type: 'Pass', Condition: '{% $exists($states.context.Steps.Mail.Status) %}', Output: '{% $states.context.Steps.Mail.Status %}' },
    })
    await port.start('r1', definition('SUCCEEDED'), {})
    await port.start('r2', definition('FAILED'), {})
    await port.drain()
    expect(sent).toEqual([{ text: 'saved' }])
    expect(port.run('r1')).toMatchObject({ status: 'succeeded', output: 'SUCCEEDED' })
    expect(port.run('r2')).toMatchObject({ status: 'succeeded', output: 'SKIPPED' })
  })

  it('skips a state whose dependency failed and was caught, unless its Condition reads that one\'s Status', async () => {
    const port = memoryRunner({
      fetch: async () => {
        throw new StepError('Http.Status', 'answered 500')
      },
    })
    await port.start('r1', flow({
      Fetch: { Type: 'Task', Resource: 'fetch', Assign: { got: '{% $states.result %}' }, Catch: [{ ErrorEquals: ['States.ALL'], Assign: { got: 'fallback' } }] },
      Use: { Type: 'Pass', Output: '{% $got %}' },
      Handle: { Type: 'Pass', Condition: "{% $states.context.Steps.Fetch.Status = 'FAILED' %}", Output: '{% { "status": $states.context.Steps.Fetch.Status, "error": $states.context.Steps.Fetch.Error, "got": $got } %}' },
      Report: { Type: 'Pass', Condition: '{% $exists($states.context.Steps.Use.Status) %}', Output: '{% $states.context.Steps.Use.Status %}' },
      // Reading the Status elsewhere than in the Condition leaves the default: skipped, as Use was
      Quiet: { Type: 'Pass', Output: '{% $states.context.Steps.Use.Status %}' },
    }), {})
    await port.drain()
    expect(port.run('r1')).toMatchObject({ status: 'succeeded', output: { Handle: { status: 'FAILED', error: 'Http.Status', got: 'fallback' }, Report: 'SKIPPED' } })
  })

  it('fails the run at once on an uncaught failure, and starts no state after it', async () => {
    const ran: string[] = []
    const port = memoryRunner({
      boom: async () => {
        throw new StepError('Remote.Down', 'down')
      },
      note: async (args) => (ran.push((args as { name: string }).name), {}),
    })
    await port.start('r1', flow({
      Boom: { Type: 'Task', Resource: 'boom', Assign: { x: '{% $states.result %}' } },
      After: { Type: 'Task', Resource: 'note', Arguments: { name: '{% "after " & $string($x) %}' } },
    }), {})
    await port.drain()
    expect(port.run('r1')).toMatchObject({ status: 'failed', error: 'Remote.Down', cause: 'down' })
    expect(ran).toEqual([])
  })
})
