import { describe, expect, it } from 'vitest'
import type { Definition, State } from '../definition/types'
import { limits } from '../limits'
import { StepError } from './errors'
import { memoryRunner } from './memory-port'
import type { TaskHandler } from './port'

const definition = (states: Record<string, State>, startAt = Object.keys(states)[0]!): Definition => ({ trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: startAt, States: states } })

// Asks someone outside to approve, handing them the try's token, and goes on with what they send back.
const approve = (extra: Partial<State> = {}): State =>
  ({
    Type: 'Task',
    Resource: 'outside:ask.waitForTaskToken',
    Arguments: { question: '{% $states.context.Execution.Input.question %}', token: '{% $states.context.Task.Token %}' },
    Assign: { answer: '{% $states.result.answer %}' },
    Next: 'Done',
    ...extra,
  }) as State

const flow = (task: State = approve()) => definition({ Approve: task, Done: { Type: 'Succeed', Output: '{% { "answer": $answer } %}' } })

const setup = (ask?: TaskHandler) => {
  const handedOff: { question: string; token: string }[] = []
  const port = memoryRunner({ 'outside:ask': ask ?? (async (args) => void handedOff.push(args as { question: string; token: string })) })
  const kept = () => JSON.stringify({ steps: port.steps, checkpoints: port.checkpoints, runs: [...port.waiting.values()].map(({ hash: _, ...rest }) => rest) })
  return { port, handedOff, kept }
}

describe('a Task that waits for an outside result', () => {
  it('hands its work off once with a token, waits holding no segment, and goes on with the result sent back', async () => {
    const { port, handedOff, kept } = setup()
    await port.start('a', flow(), { question: 'Ship it?' })
    await port.step()
    expect(handedOff).toEqual([{ question: 'Ship it?', token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) }])
    expect(port.run('a').status).toBe('waiting')
    // It waits until its timeout, the longest a waiting Task waits by default, unless an answer wakes it first.
    expect(port.queued('a')).toEqual([{ runId: 'a', at: new Date(port.now().getTime() + limits.waitingTaskTimeoutSeconds * 1000) }])

    port.tick(5000)
    expect(await port.answer(handedOff[0]!.token, { kind: 'success', output: JSON.stringify({ answer: 'yes' }) })).toEqual({ run: 'a' })
    expect(port.queued('a')).toEqual([{ runId: 'a' }])
    await port.drain()
    expect(port.run('a')).toMatchObject({ status: 'succeeded', output: { answer: 'yes' } })
    const step = port.steps.find((one) => one.state === 'Approve')!
    expect(step).toMatchObject({ status: 'succeeded', input: { question: 'Ship it?', token: '[redacted]' }, output: { answer: 'yes' }, recorded: true })
    expect(step.logs.map((line) => line.message)).toEqual([expect.stringMatching(/^Handed off; waits for an outside result until /), expect.stringMatching(/^The outside result came at /)])
    // The token grants answering, so nothing the run keeps holds it.
    expect(kept()).not.toContain(handedOff[0]!.token)
  })

  it('never hands off again when a segment runs before the answer, as after a restart', async () => {
    const { port, handedOff } = setup()
    await port.start('a', flow(), { question: 'Ship it?' })
    await port.step()
    await port.runner.segment(null, 'a', new AbortController().signal)
    await port.runner.segment(null, 'a', new AbortController().signal)
    expect(handedOff).toHaveLength(1)
    expect(port.run('a').status).toBe('waiting')
    await port.answer(handedOff[0]!.token, { kind: 'success', output: JSON.stringify({ answer: 'no' }) })
    await port.drain()
    expect(port.run('a')).toMatchObject({ status: 'succeeded', output: { answer: 'no' } })
  })

  it('hands off again with a new token when the worker stopped during the hand-off, and the first token answers nothing', async () => {
    const tokens: string[] = []
    const stop = new AbortController()
    // The first hand-off is still under way when the worker stops.
    const { port } = setup(async (args) => {
      tokens.push((args as { token: string }).token)
      if (tokens.length > 1) return
      queueMicrotask(() => stop.abort(new Error('the worker stopped')))
      await new Promise(() => {})
    })
    await port.start('a', flow(), { question: 'Ship it?' })
    await expect(port.step(stop.signal)).rejects.toThrow('the worker stopped')
    await port.runner.segment(null, 'a', new AbortController().signal)
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).not.toBe(tokens[1])
    expect(await port.answer(tokens[0]!, { kind: 'success', output: JSON.stringify({}) })).toMatchObject({ error: 'TaskDoesNotExist' })
    expect(await port.answer(tokens[1]!, { kind: 'success', output: JSON.stringify({ answer: 'yes' }) })).toEqual({ run: 'a' })
  })

  it('fails with the error and cause an outside failure names, which a catcher takes', async () => {
    const { port, handedOff } = setup()
    await port.start('a', flow(approve({ Catch: [{ ErrorEquals: ['Approval.Refused'], Assign: { answer: '{% $states.errorOutput.Cause %}' }, Next: 'Done' }] })), { question: 'Ship it?' })
    await port.step()
    await port.answer(handedOff[0]!.token, { kind: 'failure', error: 'Approval.Refused', cause: 'Not on a Friday' })
    await port.drain()
    expect(port.run('a')).toMatchObject({ status: 'succeeded', output: { answer: 'Not on a Friday' } })
    expect(port.steps.find((one) => one.state === 'Approve')).toMatchObject({ status: 'caught', error: 'Approval.Refused', cause: 'Not on a Friday' })
  })

  it('fails with States.Timeout once its TimeoutSeconds pass from its start, after which its token answers nothing', async () => {
    const { port, handedOff } = setup()
    await port.start('a', flow(approve({ TimeoutSeconds: 3600 })), { question: 'Ship it?' })
    await port.drain()
    expect(port.run('a')).toMatchObject({ status: 'failed', error: 'States.Timeout', cause: 'No outside result came within 3600 seconds' })
    expect(await port.answer(handedOff[0]!.token, { kind: 'success', output: JSON.stringify({}) })).toMatchObject({ error: 'TaskTimedOut' })
  })

  it('fails with States.HeartbeatTimeout when no heartbeat comes within HeartbeatSeconds, and a retry hands off anew', async () => {
    const { port, handedOff } = setup()
    const task = approve({ TimeoutSeconds: 3600, HeartbeatSeconds: 60, Retry: [{ ErrorEquals: ['States.HeartbeatTimeout'], MaxAttempts: 1, IntervalSeconds: 1 }] })
    await port.start('a', flow(task), { question: 'Ship it?' })
    await port.step()
    expect(port.queued('a')[0]!.at).toEqual(new Date(port.now().getTime() + 60_000))
    // Heartbeats 50 seconds apart keep it waiting past its first minute.
    for (let beat = 0; beat < 3; beat++) {
      port.tick(50_000)
      expect(await port.answer(handedOff[0]!.token, { kind: 'heartbeat' })).toEqual({ run: 'a' })
    }
    await port.step()
    expect(port.run('a').status).toBe('waiting')
    // Then silence: the try fails, and its retry hands off with a new token.
    await port.step()
    expect(port.steps.find((one) => one.state === 'Approve')).toMatchObject({ status: 'retrying', error: 'States.HeartbeatTimeout', cause: 'No heartbeat came within 60 seconds' })
    await port.step()
    expect(handedOff).toHaveLength(2)
    expect(await port.answer(handedOff[0]!.token, { kind: 'heartbeat' })).toMatchObject({ error: 'TaskTimedOut' })
    await port.answer(handedOff[1]!.token, { kind: 'success', output: JSON.stringify({ answer: 'later' }) })
    await port.drain()
    expect(port.run('a')).toMatchObject({ status: 'succeeded', output: { answer: 'later' } })
  })

  it('refuses an answer that is no token, no JSON, too large, or for a try that ended', async () => {
    const { port, handedOff } = setup()
    await port.start('a', flow(), { question: 'Ship it?' })
    await port.step()
    const token = handedOff[0]!.token
    expect(await port.answer('not-a-token', { kind: 'heartbeat' })).toMatchObject({ error: 'InvalidToken' })
    expect(await port.answer(token, { kind: 'success', output: JSON.stringify('x'.repeat(limits.valueBytes)) })).toMatchObject({ error: 'InvalidOutput' })
    // The output is a string of JSON, as SendTaskSuccess takes it.
    expect(await port.answer(token, { kind: 'success', output: 'yes, ship it' })).toMatchObject({ error: 'InvalidOutput', message: expect.stringContaining('not JSON') })
    expect(await port.answer(token, { kind: 'failure', error: 'E'.repeat(limits.taskErrorLength + 1), cause: '' })).toMatchObject({ error: 'InvalidOutput' })
    expect(await port.answer(token, { kind: 'success', output: JSON.stringify({ answer: 'yes' }) })).toEqual({ run: 'a' })
    expect(await port.answer(token, { kind: 'success', output: JSON.stringify({ answer: 'again' }) })).toMatchObject({ error: 'TaskTimedOut' })
    await port.drain()
    expect(port.run('a').output).toEqual({ answer: 'yes' })
  })

  it('fails as any Task does when its hand-off fails, and its token answers nothing', async () => {
    let token = ''
    const { port } = setup(async (args) => {
      token = (args as { token: string }).token
      throw new StepError('Outside.Unreachable', 'The approver could not be reached')
    })
    await port.start('a', flow(), { question: 'Ship it?' })
    await port.drain()
    expect(port.run('a')).toMatchObject({ status: 'failed', error: 'Outside.Unreachable' })
    expect(await port.answer(token, { kind: 'success', output: JSON.stringify({}) })).toMatchObject({ error: 'TaskTimedOut' })
  })

  it("refuses an answer once the run ended, as when another Map item's failure ended it", async () => {
    const tokens: string[] = []
    const port = memoryRunner({
      'outside:ask': async (args) => void tokens.push((args as { token: string }).token),
      fail: async () => {
        throw new StepError('Broken', 'no')
      },
    })
    const each: State = {
      Type: 'Map',
      Items: '{% [1, 2] %}',
      ItemProcessor: {
        StartAt: 'Pick',
        States: {
          Pick: { Type: 'Choice', Choices: [{ Condition: '{% $states.input = 1 %}', Next: 'Ask' }], Default: 'Break' },
          Ask: { Type: 'Task', Resource: 'outside:ask.waitForTaskToken', Arguments: { token: '{% $states.context.Task.Token %}' }, End: true },
          Break: { Type: 'Task', Resource: 'fail', End: true },
        },
      },
      End: true,
    }
    await port.start('a', definition({ Each: each }), {})
    await port.drain()
    expect(port.run('a')).toMatchObject({ status: 'failed', error: 'Broken' })
    expect(await port.answer(tokens[0]!, { kind: 'success', output: JSON.stringify({}) })).toMatchObject({ error: 'TaskTimedOut' })
  })

  it('waits in each Map item at once, each item with its own token', async () => {
    const tokens: { item: number; token: string }[] = []
    const port = memoryRunner({ 'outside:ask': async (args) => void tokens.push(args as { item: number; token: string }) })
    const each: State = {
      Type: 'Map',
      Items: '{% [1, 2, 3] %}',
      ItemProcessor: { StartAt: 'Ask', States: { Ask: { Type: 'Task', Resource: 'outside:ask.waitForTaskToken', Arguments: { item: '{% $states.input %}', token: '{% $states.context.Task.Token %}' }, End: true } } },
      End: true,
    }
    await port.start('a', definition({ Each: each }), {})
    await port.step()
    expect(tokens.map((one) => one.item)).toEqual([1, 2, 3])
    for (const { item, token } of [...tokens].reverse()) {
      await port.answer(token, { kind: 'success', output: JSON.stringify(item * 10) })
      await port.step()
    }
    expect(port.run('a')).toMatchObject({ status: 'succeeded', output: [10, 20, 30] })
  })

  it('hands nothing off in a replay, which goes on with what the replayed run was sent', async () => {
    const { port, handedOff } = setup()
    await port.start('a', flow(), { question: 'Ship it?' })
    await port.step()
    await port.answer(handedOff[0]!.token, { kind: 'success', output: JSON.stringify({ answer: 'yes' }) })
    await port.drain()
    await port.replay('b', 'a', flow())
    await port.drain()
    expect(handedOff).toHaveLength(1)
    expect(port.run('b')).toMatchObject({ status: 'succeeded', output: { answer: 'yes' } })
  })
})
