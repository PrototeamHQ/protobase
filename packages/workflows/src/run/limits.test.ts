import { describe, expect, it } from 'vitest'
import type { Definition } from '../definition/types'
import { StepError } from './errors'
import { memoryRunner } from './memory-port'
import { retryDelaySeconds } from './recovery'

const definition = (states: Definition['stateMachine']['States']): Definition => ({
  trigger: { manual: {} },
  stateMachine: { QueryLanguage: 'JSONata', StartAt: Object.keys(states)[0]!, States: states },
})

const secret = 'tok-4f9a2c71e8'

describe('the runner, failing closed at its limits', () => {
  it('ends a JSONata expression that never ends at its time limit, as an error the run can catch', async () => {
    const port = memoryRunner({})
    await port.start('loop', definition({
      Spin: { Type: 'Pass', Output: '{% ($f := function($n) { $f($n + 1) + 1 }; $f(0)) %}', Next: 'Done' },
      Done: { Type: 'Succeed' },
    }), {})
    await port.drain()
    expect(port.run('loop')).toMatchObject({ status: 'failed', error: 'States.QueryEvaluationError' })
    expect(port.steps[0]).toMatchObject({ state: 'Spin', status: 'failed', attempt: 1 })

    const caught = memoryRunner({ hang: async (args) => args })
    const started = Date.now()
    await caught.start('spin', definition({
      Spin: {
        Type: 'Task',
        Resource: 'hang',
        Arguments: { n: '{% ($loop := function($n) { $n < 0 ? 0 : $loop($n + 1) }; $loop(0)) %}' },
        Catch: [{ ErrorEquals: ['States.ALL'], Assign: { failure: '{% $states.errorOutput.Error %}' }, Next: 'Handled' }],
        End: true,
      },
      Handled: { Type: 'Succeed', Output: '{% $failure %}' },
    }), {})
    await caught.drain()
    expect(caught.run('spin')).toMatchObject({ status: 'succeeded', output: 'States.QueryEvaluationError' })
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('stops a step that ignores its signal at its timeout, recorded with its attempt', async () => {
    const port = memoryRunner({ deaf: () => new Promise(() => undefined) })
    await port.start('deaf', definition({ Hang: { Type: 'Task', Resource: 'deaf', TimeoutSeconds: 1, Catch: [{ ErrorEquals: ['States.Timeout'], Next: 'Late' }], End: true }, Late: { Type: 'Fail', Error: 'Late' } }), {})
    await port.drain()
    expect(port.steps[0]).toMatchObject({ state: 'Hang', status: 'caught', attempt: 1, error: 'States.Timeout' })
    expect(port.run('deaf')).toMatchObject({ status: 'failed', error: 'Late' })
  })

  it('stops a Choice loop that never ends at the step cap, which no catcher catches', async () => {
    const port = memoryRunner({}, { maxSteps: 50 })
    await port.start('cycle', definition({
      Again: { Type: 'Choice', Choices: [{ Condition: '{% true %}', Next: 'Turn' }] },
      Turn: { Type: 'Pass', Next: 'Again' },
    }), {})
    await port.drain()
    expect(port.run('cycle')).toMatchObject({ status: 'failed', error: 'States.Runtime', cause: 'The run took more than 50 steps' })
    expect(port.steps).toHaveLength(50)
  })

  it('fails a Map over more items than it takes before any item runs', async () => {
    const port = memoryRunner({})
    await port.start('wide', definition({
      Each: { Type: 'Map', Items: '{% [1..10001] %}', ItemProcessor: { StartAt: 'Item', States: { Item: { Type: 'Pass', End: true } } }, Catch: [{ ErrorEquals: ['States.ALL'], Next: 'Fine' }], End: true },
      Fine: { Type: 'Succeed' },
    }), {})
    await port.drain()
    expect(port.run('wide')).toMatchObject({ status: 'failed', error: 'States.DataLimitExceeded', cause: 'Items: 10001 items, more than the 10000 a Map takes' })
    expect(port.steps.filter((step) => step.scope !== '')).toEqual([])
  })

  it('waits at most a day between two tries, however the backoff grows', () => {
    expect(retryDelaySeconds({ ErrorEquals: ['States.ALL'], IntervalSeconds: 86400, BackoffRate: 10 }, 3)).toBe(86400)
    expect(retryDelaySeconds({ ErrorEquals: ['States.ALL'], IntervalSeconds: 2, BackoffRate: 2, MaxDelaySeconds: 5 }, 3)).toBe(5)
    expect(retryDelaySeconds({ ErrorEquals: ['States.ALL'], IntervalSeconds: 2, BackoffRate: 2 }, 2)).toBe(8)
  })

  it('fails a Wait whose Timestamp is more than 366 days away, or not a time on the calendar', async () => {
    for (const [id, timestamp, cause] of [
      ['far', '2028-01-01T00:00:00Z', 'Timestamp: gave "2028-01-01T00:00:00Z", more than 31622400 seconds from now'],
      ['feb', '2026-02-30T12:00:00Z', 'Timestamp: gave "2026-02-30T12:00:00Z", not an ISO 8601 time such as 2026-11-04T12:00:00Z'],
      ['loose', 'December 1, 2026', 'Timestamp: gave "December 1, 2026", not an ISO 8601 time such as 2026-11-04T12:00:00Z'],
    ] as const) {
      const port = memoryRunner({})
      await port.start(id, definition({ Hold: { Type: 'Wait', Timestamp: timestamp, End: true } }), {})
      await port.drain()
      expect(port.run(id)).toMatchObject({ status: 'failed', error: 'States.QueryEvaluationError', cause })
    }
    const port = memoryRunner({})
    await port.start('near', definition({ Hold: { Type: 'Wait', Timestamp: '2026-12-01T09:30:00+01:00', End: true } }), {})
    await port.drain()
    expect(port.run('near').status).toBe('succeeded')
    expect(port.steps[0]!.resumeAt).toEqual(new Date('2026-12-01T08:30:00Z'))
  })

  it('keeps 100 log lines of a step that logs 1,000, and the step still succeeds', async () => {
    const port = memoryRunner({ chatty: async (_, { log }) => { for (let line = 0; line < 1000; line++) log(`line ${line} ${'x'.repeat(2000)}`) } })
    await port.start('chatty', definition({ Talk: { Type: 'Task', Resource: 'chatty', End: true } }), {})
    await port.drain()
    const logs = port.steps[0]!.logs
    expect(port.run('chatty').status).toBe('succeeded')
    expect(logs).toHaveLength(101)
    expect(logs[0]!.message).toHaveLength(1001)
    expect(logs[100]!.message).toBe('… 900 more lines not kept')
  })
})

describe('the runner, keeping secrets out of what it records', () => {
  it('reads a secret by name, and records it nowhere: not in an input, output, variable, log, error or the run', async () => {
    const port = memoryRunner({
      call: async (args, { log }) => {
        log(`calling with ${JSON.stringify(args)}`)
        throw new StepError('Remote.Refused', `the server said: bad token ${secret}`)
      },
    }, { secrets: { TICKETS_TOKEN: secret } })
    await port.start('secret', definition({
      Keep: { Type: 'Pass', Assign: { token: '{% $states.context.Secrets.TICKETS_TOKEN %}' }, Output: '{% "out " & $states.context.Secrets.TICKETS_TOKEN %}', Next: 'Wait' },
      Wait: { Type: 'Wait', Seconds: 5, Next: 'Call' },
      Call: {
        Type: 'Task',
        Resource: 'call',
        Arguments: { headers: { Authorization: '{% "Bearer " & $token %}' }, url: '{% "https://example.test/?key=" & $states.context.Secrets.TICKETS_TOKEN %}' },
        Catch: [{ ErrorEquals: ['States.ALL'], Assign: { failure: '{% $states.errorOutput %}' }, Next: 'Report' }],
        End: true,
      },
      Report: { Type: 'Fail', Error: 'Reported', Cause: '{% $failure.Cause & " " & $states.context.Secrets.TICKETS_TOKEN %}' },
    }), {})
    await port.drain()
    const recorded = JSON.stringify({ steps: port.steps, run: port.run('secret') })
    expect(recorded).not.toContain(secret)
    expect(recorded).not.toContain(secret.slice(0, 8))
    expect(port.run('secret')).toMatchObject({ status: 'failed', error: 'Reported', cause: '[redacted]' })
    expect(port.steps.find((step) => step.state === 'Call')).toMatchObject({ input: { headers: { Authorization: '[redacted]' }, url: '[redacted]' }, cause: 'the server said: bad token [redacted]' })
  })

  it('keeps a value computed from a secret as [redacted], however the expression changed it, and gives the step type the value', async () => {
    const sent: unknown[] = []
    const port = memoryRunner({ call: async (args) => void sent.push(args) }, { secrets: { TICKETS_TOKEN: secret } })
    const basic = '{% "Basic " & $base64encode("user:" & $states.context.Secrets.TICKETS_TOKEN) %}'
    await port.start('encoded', definition({
      Keep: { Type: 'Pass', Assign: { header: basic, tail: '{% $substring($states.context.Secrets.TICKETS_TOKEN, 4) %}' }, Next: 'Call' },
      Call: { Type: 'Task', Resource: 'call', Arguments: { auth: basic, kept: '{% $header %}', page: 2 }, End: true },
    }), {})
    await port.drain()
    const encoded = `Basic ${btoa(`user:${secret}`)}`
    expect(sent).toEqual([{ auth: encoded, kept: '[redacted]', page: 2 }])
    expect(port.steps.map((step) => [step.state, step.state === 'Keep' ? step.assigned : step.input])).toEqual([['Keep', { header: '[redacted]', tail: '[redacted]' }], ['Call', { auth: '[redacted]', kept: '[redacted]', page: 2 }]])
    expect(JSON.stringify(port.steps)).not.toContain(btoa(`user:${secret}`).slice(0, 12))
  })

  it('refuses a secret too short to blank out', () => {
    expect(() => memoryRunner({}, { secrets: { PIN: '1234' } })).toThrow('A secret workflows read is shorter than 8 characters, too short to blank out of what runs record')
  })

  it('gives the run its start time and input through $states.context', async () => {
    const port = memoryRunner({})
    await port.start('context', definition({ Show: { Type: 'Succeed', Output: '{% [$states.context.Execution.StartTime, $states.context.Execution.Input.id] %}' } }), { id: 7 })
    await port.drain()
    expect(port.run('context').output).toEqual(['2026-11-04T12:00:00.000Z', 7])
  })
})
