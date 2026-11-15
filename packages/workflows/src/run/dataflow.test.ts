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

  it("runs a state whose Condition reads a state that is skipped later in the list, once that one is skipped", async () => {
    const ran: string[] = []
    const port = memoryRunner({ note: async (args) => void ran.push((args as { name: string }).name) })
    await port.start('rescan', flow({
      Handle: { Type: 'Task', Resource: 'note', Arguments: { name: 'handle' }, Condition: "{% $states.context.Steps.Gate.Status = 'SKIPPED' %}" },
      Gate: { Type: 'Task', Resource: 'note', Arguments: { name: 'gate' }, Condition: '{% false %}' },
    }), {})
    await port.drain()
    expect(port.run('rescan').status).toBe('succeeded')
    expect(ran).toEqual(['handle'])
  })

  it("lets a Map item's states read the statuses of the states around the Map", async () => {
    const port = memoryRunner({ save: async () => ({ saved: true }), note: async (args) => args })
    await port.start('outer', flow({
      Save: { Type: 'Task', Resource: 'save' },
      Each: {
        Type: 'Map',
        Items: '{% [1, 2] %}',
        Condition: "{% $states.context.Steps.Save.Status = 'SUCCEEDED' %}",
        ItemProcessor: { States: { Tell: { Type: 'Task', Resource: 'note', Arguments: { item: '{% $states.input %}' }, Condition: "{% $states.context.Steps.Save.Status = 'SUCCEEDED' %}" } } },
      },
    }), {})
    await port.drain()
    expect(port.run('outer')).toMatchObject({ status: 'succeeded', output: [{ item: 1 }, { item: 2 }] })
  })

  it("stops a Map item's states too when a state around the Map fails, before they take another step", async () => {
    const first = deferred()
    const ran: string[] = []
    const port = memoryRunner({
      slow: async () => {
        await first.promise
        ran.push('slow')
        return 1
      },
      mail: async () => void ran.push('mail'),
      boom: async () => {
        throw new StepError('Broken', 'no')
      },
    })
    await port.start('stop', flow({
      Boom: { Type: 'Task', Resource: 'boom' },
      Each: {
        Type: 'Map',
        Items: '{% [1] %}',
        ItemProcessor: { States: { Slow: { Type: 'Task', Resource: 'slow', Assign: { got: '{% $states.result %}' } }, Mail: { Type: 'Task', Resource: 'mail', Arguments: { got: '{% $got %}' } } } },
      },
    }), {})
    const segment = port.step()
    // Boom fails while Slow is under way; Slow then ends, and Mail, which reads it, must not start
    await new Promise((resolve) => setTimeout(resolve, 20))
    first.resolve()
    await segment
    await port.drain()
    expect(port.run('stop')).toMatchObject({ status: 'failed', error: 'Broken' })
    expect(ran).toEqual(['slow'])
  })

  it('lets the states still running end before a failed save stops the segment', async () => {
    let slowEnded = false
    const port = memoryRunner({
      write: async () => 'written',
      slow: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        slowEnded = true
        return 'slow'
      },
    })
    await port.start('save', flow({ Write: { Type: 'Task', Resource: 'write' }, Slow: { Type: 'Task', Resource: 'slow', Arguments: { readonly: true } } }), {})
    port.store.save = async () => {
      throw new Error('the database went away')
    }
    await expect(port.step()).rejects.toThrow('the database went away')
    expect(slowEnded).toBe(true)
  })

  it('re-runs a failed run from the checkpoint of the state that failed, the states that ended kept', async () => {
    const calls: string[] = []
    let fixed = false
    const port = memoryRunner({
      get: async (args) => (calls.push((args as { name: string }).name), { value: (args as { name: string }).name }),
      fetch: async () => {
        calls.push('fetch')
        if (!fixed) throw new StepError('Http.Status', '503')
        return { value: 'fetched' }
      },
    })
    const machine = flow({
      A: { Type: 'Task', Resource: 'get', Arguments: { name: 'a' }, Assign: { a: '{% $states.result %}' } },
      Fetch: { Type: 'Task', Resource: 'fetch', Retry: [{ ErrorEquals: ['Http.Status'], MaxAttempts: 1, IntervalSeconds: 1 }], Assign: { f: '{% $states.result %}' } },
      Save: { Type: 'Pass', Output: '{% $a.value & "+" & $f.value %}' },
    })
    await port.start('failed', machine, {})
    await port.drain()
    expect(port.run('failed')).toMatchObject({ status: 'failed', error: 'Http.Status' })
    fixed = true
    calls.length = 0
    await port.rerun('again', 'failed', machine)
    await port.drain()
    expect(port.run('again')).toMatchObject({ status: 'succeeded', output: 'a+fetched' })
    expect(calls).toEqual(['fetch'])
  })

  it('re-runs an ended run from a state: it and the states after it run again, the others stay as they ran', async () => {
    const calls: string[] = []
    const port = memoryRunner({ get: async (args) => (calls.push((args as { name: string }).name), { value: (args as { name: string }).name }) })
    const machine = (suffix: string) =>
      flow({
        A: { Type: 'Task', Resource: 'get', Arguments: { name: 'a' }, Assign: { a: '{% $states.result %}' } },
        B: { Type: 'Task', Resource: 'get', Arguments: { name: `b${suffix}` }, Assign: { b: '{% $states.result %}' } },
        Save: { Type: 'Pass', Output: '{% $a.value & "+" & $b.value %}' },
      })
    await port.start('done', machine(''), {})
    await port.drain()
    expect(port.run('done')).toMatchObject({ status: 'succeeded', output: 'a+b' })
    calls.length = 0
    await port.rerun('from-b', 'done', machine('2'), 'B')
    await port.drain()
    expect(port.run('from-b')).toMatchObject({ status: 'succeeded', output: 'a+b2' })
    expect(calls).toEqual(['b2'])
    await expect(port.rerun('never', 'done', machine(''), 'Gone')).rejects.toThrow('The workflow no longer has state "Gone"')
  })

  it("runs a Map whose item's Condition reads a state that failed into a catcher, so that item can recover", async () => {
    const ran: string[] = []
    const port = memoryRunner({
      save: async () => {
        throw new StepError('Broken', 'no')
      },
      recover: async (args) => void ran.push(String((args as { item: number }).item)),
    })
    await port.start('recover', flow({
      Save: { Type: 'Task', Resource: 'save', Catch: [{ ErrorEquals: ['Broken'] }] },
      Each: {
        Type: 'Map',
        Items: '{% [1] %}',
        ItemProcessor: { States: { Recover: { Type: 'Task', Resource: 'recover', Arguments: { item: '{% $states.input %}' }, Condition: "{% $states.context.Steps.Save.Status = 'FAILED' %}" } } },
      },
    }), {})
    await port.drain()
    expect(port.run('recover').status).toBe('succeeded')
    expect(ran).toEqual(['1'])
  })

  it('runs a state named as an object member, such as toString', async () => {
    const port = memoryRunner({ note: async () => 'noted' })
    await port.start('named', flow({ toString: { Type: 'Task', Resource: 'note' } }), {})
    await port.drain()
    expect(port.run('named')).toMatchObject({ status: 'succeeded', output: 'noted' })
  })

  it('keeps a state a re-run from another kept, though its Condition no longer holds', async () => {
    const calls: string[] = []
    const port = memoryRunner({ get: async (args) => (calls.push((args as { name: string }).name), (args as { name: string }).name) })
    const machine = (condition: string) =>
      flow({
        A: { Type: 'Task', Resource: 'get', Arguments: { name: 'a' }, Assign: { a: '{% $states.result %}' } },
        B: { Type: 'Task', Resource: 'get', Arguments: { name: 'b' }, Condition: condition, Assign: { b: '{% $states.result %}' } },
        Both: { Type: 'Pass', Output: '{% $a & "+" & $b %}' },
      })
    await port.start('first', machine('{% true %}'), {})
    await port.drain()
    calls.length = 0
    await port.rerun('again', 'first', machine('{% false %}'), 'A')
    await port.drain()
    expect(port.run('again')).toMatchObject({ status: 'succeeded', output: 'a+b' })
    expect(calls).toEqual(['a'])
  })
})
