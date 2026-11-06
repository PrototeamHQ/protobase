import { describe, expect, it } from 'vitest'
import type { Definition } from '../definition/types'
import { StepError } from './errors'
import { memoryRunner } from './memory-port'

const definition = (states: Definition['stateMachine']['States'], startAt = Object.keys(states)[0]!): Definition => ({
  trigger: { manual: {} },
  stateMachine: { QueryLanguage: 'JSONata', StartAt: startAt, States: states },
})
const pick = <T extends object>(rows: T[], ...keys: (keyof T)[]) => rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key]])))

describe('the runner', () => {
  it('runs a branch and a step per item, saving each step with its input, output, logs and timing', async () => {
    const fetched: unknown[] = []
    const port = memoryRunner({
      fetch: async (args, { log }) => {
        fetched.push(args)
        log('fetched the list')
        return { items: [{ price: 2 }, { price: 5 }] }
      },
    })
    await port.start('r1', definition({
      Fetch: { Type: 'Task', Resource: 'fetch', Arguments: { list: '{% $states.context.Execution.Input.list %}' }, Assign: { items: '{% $states.result.items %}' }, Next: 'Any' },
      Any: { Type: 'Choice', Choices: [{ Condition: '{% $count($items) > 0 %}', Next: 'Each' }], Default: 'None' },
      Each: {
        Type: 'Map',
        Items: '{% $items %}',
        ItemProcessor: { StartAt: 'Double', States: { Double: { Type: 'Pass', Output: '{% $states.input.price * 2 %}', End: true } } },
        Assign: { doubled: '{% $states.result %}' },
        Next: 'Merge',
      },
      Merge: { Type: 'Succeed', Output: '{% {"total": $sum($doubled), "list": $states.context.Execution.Input.list} %}' },
      None: { Type: 'Succeed' },
    }), { list: 'prices' })
    await port.drain()

    expect(port.run('r1')).toMatchObject({ status: 'succeeded', output: { total: 14, list: 'prices' } })
    expect(fetched).toEqual([{ list: 'prices' }])
    expect(pick(port.steps, 'scope', 'seq', 'state', 'status', 'input', 'output', 'next')).toEqual([
      { scope: '', seq: 0, state: 'Fetch', status: 'succeeded', input: { list: 'prices' }, output: { items: [{ price: 2 }, { price: 5 }] }, next: 'Any' },
      { scope: '', seq: 1, state: 'Any', status: 'succeeded', input: { items: [{ price: 2 }, { price: 5 }] }, output: { items: [{ price: 2 }, { price: 5 }] }, next: 'Each' },
      { scope: 'Each.2[0]', seq: 0, state: 'Double', status: 'succeeded', input: { price: 2 }, output: 4, next: null },
      { scope: 'Each.2[1]', seq: 0, state: 'Double', status: 'succeeded', input: { price: 5 }, output: 10, next: null },
      { scope: '', seq: 2, state: 'Each', status: 'succeeded', input: { items: 2 }, output: [4, 10], next: 'Merge' },
      { scope: '', seq: 3, state: 'Merge', status: 'succeeded', input: [4, 10], output: { total: 14, list: 'prices' }, next: null },
    ])
    expect(port.steps[0]).toMatchObject({ type: 'Task', attempt: 1, assigned: { items: [{ price: 2 }, { price: 5 }] }, logs: [{ message: 'fetched the list' }] })
    expect(port.steps[1]!.logs).toEqual([{ at: expect.any(String), message: 'Choice 1 holds' }])
    expect(port.steps[0]!.startedAt).toBeInstanceOf(Date)
    expect(port.steps[0]!.finishedAt).toBeInstanceOf(Date)
  })

  it('retries a failing step as set, then records its error and takes its error path', async () => {
    let tries = 0
    const port = memoryRunner({
      flaky: async () => {
        tries++
        throw new StepError('Remote.Down', `try ${tries} failed`)
      },
    })
    await port.start('r2', definition({
      Call: {
        Type: 'Task',
        Resource: 'flaky',
        Retry: [{ ErrorEquals: ['Remote.Down'], IntervalSeconds: 10, MaxAttempts: 2, BackoffRate: 3 }],
        Catch: [{ ErrorEquals: ['States.ALL'], Assign: { failure: '{% $states.errorOutput %}' }, Next: 'Report' }],
        Next: 'Done',
      },
      Report: { Type: 'Fail', Error: 'Reported', Cause: '{% $failure.Cause %}' },
      Done: { Type: 'Succeed' },
    }), {})
    const start = port.now().getTime()
    await port.drain()

    expect(tries).toBe(3)
    expect(pick(port.steps, 'state', 'status', 'attempt', 'error', 'cause', 'next')).toEqual([
      { state: 'Call', status: 'retrying', attempt: 1, error: 'Remote.Down', cause: 'try 1 failed', next: null },
      { state: 'Call', status: 'retrying', attempt: 2, error: 'Remote.Down', cause: 'try 2 failed', next: null },
      { state: 'Call', status: 'caught', attempt: 3, error: 'Remote.Down', cause: 'try 3 failed', next: 'Report' },
      { state: 'Report', status: 'failed', attempt: 1, error: 'Reported', cause: 'try 3 failed', next: null },
    ])
    expect(port.steps.slice(0, 2).map((step) => (step.resumeAt!.getTime() - start) / 1000)).toEqual([10, 40])
    expect(port.run('r2')).toMatchObject({ status: 'failed', error: 'Reported', cause: 'try 3 failed' })
  })

  it('waits as a segment of its own, and wakes when the queue runs it at the wait\'s end', async () => {
    const calls: string[] = []
    const port = memoryRunner({ note: async (args) => void calls.push((args as { at: string }).at) })
    await port.start('r3', definition({
      Before: { Type: 'Task', Resource: 'note', Arguments: { at: 'before' }, Next: 'Pause' },
      Pause: { Type: 'Wait', Seconds: '{% $states.context.Execution.Input.seconds %}', Next: 'After' },
      After: { Type: 'Task', Resource: 'note', Arguments: { at: 'after' }, End: true },
    }), { seconds: 3600 })
    await port.step()
    expect(port.run('r3')).toMatchObject({ status: 'waiting', resumeAt: new Date('2026-11-04T13:00:00Z') })
    expect(calls).toEqual(['before'])
    await port.drain()
    expect(calls).toEqual(['before', 'after'])
    expect(port.run('r3').status).toBe('succeeded')
  })

  it('takes up after a worker stopped mid-step, running only that step again', async () => {
    const calls: string[] = []
    const worker = new AbortController()
    const port = memoryRunner({
      note: async (args) => void calls.push((args as { at: string }).at),
      slow: async (_, { signal }) => {
        calls.push('slow')
        if (calls.filter((call) => call === 'slow').length > 1) return 'done'
        worker.abort(new Error('the worker stopped'))
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
      },
    })
    await port.start('r4', definition({
      Before: { Type: 'Task', Resource: 'note', Arguments: { at: 'before' }, Next: 'Slow' },
      Slow: { Type: 'Task', Resource: 'slow', End: true },
    }), {})
    await expect(port.step(worker.signal)).rejects.toThrow('the worker stopped')
    expect(port.steps.map((step) => step.state)).toEqual(['Before'])
    // The queue runs the failed job again, as pg-boss retries it.
    await port.runner.segment(null, 'r4', new AbortController().signal)
    expect(calls).toEqual(['before', 'slow', 'slow'])
    expect(port.run('r4')).toMatchObject({ status: 'succeeded', output: 'done' })
  })

  it('fails a step that runs past its timeout with States.Timeout', async () => {
    const port = memoryRunner({ never: (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))) })
    await port.start('r5', definition({ Hang: { Type: 'Task', Resource: 'never', TimeoutSeconds: 1, End: true } }), {})
    await port.drain()
    expect(port.run('r5')).toMatchObject({ status: 'failed', error: 'States.Timeout', cause: 'The step ran longer than 1 seconds' })
  })

  it('names a thrown error of no name States.TaskFailed, and redacts secrets in the input it records', async () => {
    const port = memoryRunner({ call: async () => { throw new Error('connection reset') } })
    await port.start('r6', definition({ Call: { Type: 'Task', Resource: 'call', Arguments: { url: 'https://example.test', headers: { Authorization: '{% $states.context.Execution.Input.key %}' } }, End: true } }), { key: 'Bearer s3cret' })
    await port.drain()
    expect(port.run('r6')).toMatchObject({ status: 'failed', error: 'States.TaskFailed', cause: 'connection reset' })
    expect(port.steps[0]!.input).toEqual({ url: 'https://example.test', headers: { Authorization: '[redacted]' } })
  })

  it('blanks a value a step marks secret, such as its access token, out of its logs, output, error and the run', async () => {
    const token = 'ya29.issued-access-token'
    const port = memoryRunner({
      use: async (_, { secret, log }) => {
        secret(token)
        log(`Authorization: Bearer ${token}`)
        return { echoed: token }
      },
      fail: async (_, { secret }) => {
        secret(token)
        throw new Error(`the provider refused ${token}`)
      },
    })
    await port.start('r6b', definition({ Use: { Type: 'Task', Resource: 'use', Next: 'Fail' }, Fail: { Type: 'Task', Resource: 'fail', End: true } }), {})
    await port.drain()
    expect(port.run('r6b')).toMatchObject({ status: 'failed', cause: 'the provider refused [redacted]' })
    expect(JSON.stringify([port.run('r6b'), port.steps])).not.toContain(token)
    expect(port.steps[0]).toMatchObject({ output: { echoed: '[redacted]' }, logs: [{ message: 'Authorization: Bearer [redacted]' }] })
  })

  it('runs a Map whose item waits, ending the segment until the wait is over', async () => {
    const port = memoryRunner({})
    await port.start('r7', definition({
      Both: { Type: 'Pass', Assign: { sums: '{% [$states.context.Execution.Input.a, $states.context.Execution.Input.b] %}' }, Next: 'Each' },
      Each: {
        Type: 'Map',
        Items: '{% $sums %}',
        MaxConcurrency: 1,
        ItemProcessor: { StartAt: 'Hold', States: { Hold: { Type: 'Wait', Seconds: '{% $states.input %}', Next: 'Out' }, Out: { Type: 'Pass', Output: '{% $sums %}', End: true } } },
        End: true,
      },
    }), { a: 60, b: 30 })
    await port.step()
    expect(port.run('r7')).toMatchObject({ status: 'waiting', resumeAt: new Date('2026-11-04T12:00:30Z') })
    await port.drain()
    expect(port.run('r7')).toMatchObject({ status: 'succeeded', output: [[60, 30], [60, 30]] })
  })

  it('hands the rest of a run to the next segment once its time is up, and stops when another segment saved first', async () => {
    const port = memoryRunner({ tick: async () => new Promise((resolve) => setTimeout(() => resolve(1), 5)) }, { budgetMs: 1 })
    await port.start('r8', definition({ A: { Type: 'Task', Resource: 'tick', Next: 'B' }, B: { Type: 'Task', Resource: 'tick', End: true } }), {})
    await port.step()
    expect(port.steps.map((step) => step.state)).toEqual(['A'])
    expect(port.run('r8').status).toBe('running')
    await port.drain()
    expect(port.run('r8').status).toBe('succeeded')

    const raced = memoryRunner({ tick: async () => 1 })
    await raced.start('r9', definition({ A: { Type: 'Task', Resource: 'tick', End: true } }), {})
    raced.steps.push({ runId: 'r9', scope: '', seq: 0, state: 'A', type: 'Task', status: 'succeeded', attempt: 1, next: null, output: 2, logs: [], startedAt: raced.now(), finishedAt: raced.now() })
    await raced.runner.segment(null, 'r9', new AbortController().signal)
    expect(raced.run('r9').status).toBe('succeeded')
  })

  it('fails a step whose output is larger than a step may save, which no catcher catches', async () => {
    const port = memoryRunner({ big: async () => 'x'.repeat(1024 * 1024 + 1) })
    await port.start('r10', definition({ Big: { Type: 'Task', Resource: 'big', Catch: [{ ErrorEquals: ['States.ALL'], Next: 'Fine' }], End: true }, Fine: { Type: 'Succeed' } }), {})
    await port.drain()
    expect(port.run('r10')).toMatchObject({ status: 'failed', error: 'States.DataLimitExceeded', cause: "The step's output is larger than 1 MiB" })
  })

  it("keeps a matched choice's Output of null, rather than the Choice state's own", async () => {
    const port = memoryRunner({})
    await port.start('r11', definition({
      Pick: { Type: 'Choice', Output: '{% "the state\'s" %}', Choices: [{ Condition: '{% true %}', Output: null, Next: 'Done' }] },
      Done: { Type: 'Succeed' },
    }), {})
    await port.drain()
    expect(port.steps[0]).toMatchObject({ state: 'Pick', output: null })
  })

  it('gives every try of a step the same idempotency key, and a later visit of the state another', async () => {
    const keys: string[] = []
    let tries = 0
    const port = memoryRunner({
      flaky: async (_, { idempotencyKey }) => {
        keys.push(idempotencyKey)
        if (++tries < 3) throw new StepError('Remote.Busy', 'try again')
      },
    })
    await port.start('r12', definition({
      Send: { Type: 'Task', Resource: 'flaky', Retry: [{ ErrorEquals: ['Remote.Busy'], IntervalSeconds: 1 }], Next: 'Again' },
      Again: { Type: 'Choice', Choices: [{ Condition: '{% $sent = true %}', Next: 'Done' }], Default: 'Mark' },
      Mark: { Type: 'Pass', Assign: { sent: true }, Next: 'Send' },
      Done: { Type: 'Succeed' },
    }), {})
    await port.drain()
    expect(port.run('r12').status).toBe('succeeded')
    expect(keys).toEqual(['r12//0', 'r12//0', 'r12//0', 'r12//5'])
  })

  it('starts no step once the worker has stopped, leaving the run to the next segment', async () => {
    const called: unknown[] = []
    const port = memoryRunner({ call: async (args) => void called.push(args) })
    await port.start('r13', definition({ Call: { Type: 'Task', Resource: 'call', End: true } }), {})
    const stopped = new AbortController()
    stopped.abort(new Error('worker stopped'))
    await expect(port.step(stopped.signal)).rejects.toThrow('worker stopped')
    expect(called).toEqual([])
    expect(port.steps).toEqual([])
  })

  it('keeps two runs of one port apart, and gives the next state null for a step that gave nothing', async () => {
    const port = memoryRunner({ quiet: async () => undefined })
    const quiet = definition({ Call: { Type: 'Task', Resource: 'quiet', Next: 'Show' }, Show: { Type: 'Succeed', Output: '{% $states.input = null %}' } }, 'Call')
    await port.start('r14', quiet, {})
    await port.drain()
    await port.start('r15', quiet, {})
    await port.drain()
    expect(port.run('r15')).toMatchObject({ status: 'succeeded', output: true })
    expect(port.steps.filter((step) => step.runId === 'r15')).toHaveLength(2)
  })
})
