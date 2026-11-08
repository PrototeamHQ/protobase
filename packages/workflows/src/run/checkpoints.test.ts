import { describe, expect, it } from 'vitest'
import type { Definition } from '../definition/types'
import { memoryRunner } from './memory-port'
import type { TaskHandler } from './port'
import { secretRedactor } from './redact'
import { runSegment } from './segment'

const definition = (states: Definition['stateMachine']['States'], startAt = Object.keys(states)[0]!): Definition => ({
  trigger: { manual: {} },
  stateMachine: { QueryLanguage: 'JSONata', StartAt: startAt, States: states },
})

/** A step type that only reads, as a GET does. */
const reading = (handler: TaskHandler): TaskHandler => Object.assign(handler, { writes: () => false })

/** A step type that stops the worker on its first call, as a crash mid-step does, and gives `result` after. */
const crashingOnce = (worker: AbortController, result: unknown) => {
  let calls = 0
  return reading(async (_, { signal }) => {
    if (++calls > 1) return result
    worker.abort(new Error('the worker stopped'))
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
  })
}

describe('when the runner saves checkpoints', () => {
  it('saves nothing for a run of only steps without effects that ends in its segment', async () => {
    const port = memoryRunner({ fetch: reading(async () => 1) })
    await port.start('r1', definition({
      Start: { Type: 'Pass', Output: 1, Next: 'Fetch' },
      Fetch: { Type: 'Task', Resource: 'fetch', Next: 'Check' },
      Check: { Type: 'Choice', Choices: [{ Condition: '{% true %}', Next: 'Done' }] },
      Done: { Type: 'Succeed' },
    }), {})
    await port.drain()

    expect(port.run('r1').status).toBe('succeeded')
    expect(port.writes).toEqual([])
    expect(port.steps.map((step) => step.state)).toEqual(['Start', 'Fetch', 'Check', 'Done'])
  })

  it("saves a write's checkpoint before the next state runs, without its input, and drops it when the run ends", async () => {
    let seen: unknown[] = []
    const port = memoryRunner({
      send: async () => ({ message_id: '<1@x>' }),
      after: async () => {
        seen = structuredClone(port.checkpoints)
      },
    })
    await port.start('r2', definition({
      Send: { Type: 'Task', Resource: 'send', Arguments: { text: 'a long body' }, Assign: { sent: '{% $states.result.message_id %}' }, Next: 'After' },
      After: { Type: 'Task', Resource: 'after', End: true },
    }), {})
    await port.drain()

    expect(seen).toEqual([expect.objectContaining({ scope: '', seq: 0, state: 'Send', status: 'succeeded', next: 'After', value: { message_id: '<1@x>' }, variables: { sent: '<1@x>' }, after: -1 })])
    expect(JSON.stringify(seen)).not.toContain('a long body')
    expect(port.checkpoints).toEqual([])
  })

  it('sends a mail once and fetches again a GET after it when the worker stops before the next checkpoint', async () => {
    const worker = new AbortController()
    let mails = 0
    let gets = 0
    const port = memoryRunner({
      mail: async () => ({ message_id: `<${++mails}@x>` }),
      get: reading(async () => ++gets),
      slow: crashingOnce(worker, 'done'),
    })
    await port.start('r3', definition({
      Mail: { Type: 'Task', Resource: 'mail', Next: 'Get' },
      Get: { Type: 'Task', Resource: 'get', Next: 'Slow' },
      Slow: { Type: 'Task', Resource: 'slow', End: true },
    }), {})
    await expect(port.step(worker.signal)).rejects.toThrow('the worker stopped')
    await port.runner.segment(null, 'r3', new AbortController().signal)

    expect(port.run('r3')).toMatchObject({ status: 'succeeded', output: 'done' })
    expect({ mails, gets }).toEqual({ mails: 1, gets: 2 })
  })

  it('keeps in the trace a write whose checkpoint was saved before the worker stopped, which the run does not call again', async () => {
    const worker = new AbortController()
    const port = memoryRunner({ mail: async () => ({ message_id: '<1@x>' }), slow: crashingOnce(worker, 'done') })
    await port.start('r8', definition({
      Mail: { Type: 'Task', Resource: 'mail', Next: 'Slow' },
      Slow: { Type: 'Task', Resource: 'slow', End: true },
    }), {})
    await expect(port.step(worker.signal)).rejects.toThrow('the worker stopped')
    await port.runner.segment(null, 'r8', new AbortController().signal)

    expect(port.run('r8')).toMatchObject({ status: 'succeeded', output: 'done' })
    expect(port.steps.map(({ state, output }) => ({ state, output }))).toEqual([{ state: 'Mail', output: { message_id: '<1@x>' } }, { state: 'Slow', output: 'done' }])
  })

  it('gives a write the same idempotency key when a crash between its commit and its checkpoint makes the run call it again', async () => {
    const worker = new AbortController()
    // A records store that keeps one record per key, as the records step's effects do
    const records = new Map<string, number>()
    const keys: string[] = []
    const port = memoryRunner({
      lookup: reading(async () => 1),
      create: async (_, { idempotencyKey, signal }) => {
        keys.push(idempotencyKey)
        if (!records.has(idempotencyKey)) records.set(idempotencyKey, records.size + 1)
        if (keys.length > 1) return { key: records.get(idempotencyKey) }
        // The record committed, and the worker stops before the step's result is recorded
        worker.abort(new Error('the worker stopped'))
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
      },
    })
    await port.start('r7', definition({
      Lookup: { Type: 'Task', Resource: 'lookup', Next: 'Create' },
      Create: { Type: 'Task', Resource: 'create', Retry: [{ ErrorEquals: ['States.ALL'], MaxAttempts: 2 }], End: true },
    }), {})
    await expect(port.step(worker.signal)).rejects.toThrow('the worker stopped')
    await port.runner.segment(null, 'r7', new AbortController().signal)

    expect(port.run('r7')).toMatchObject({ status: 'succeeded', output: { key: 1 } })
    expect(keys).toEqual(['r7//1', 'r7//1'])
    expect(records.size).toBe(1)
  })

  it('does not call again a write a crash came after, and keeps when its result was fetched', async () => {
    const worker = new AbortController()
    let uploads = 0
    const port = memoryRunner({ upload: async () => ({ ref: `files/${++uploads}` }), slow: crashingOnce(worker, 'done') })
    await port.start('r4', definition({
      Upload: { Type: 'Task', Resource: 'upload', Assign: { ref: '{% $states.result.ref %}', fetched: '{% $now() %}' }, Next: 'Slow' },
      Slow: { Type: 'Task', Resource: 'slow', Next: 'Done' },
      Done: { Type: 'Succeed', Output: '{% {"ref": $ref, "fetched": $fetched} %}' },
    }), {})
    const fetchedAt = port.now()
    port.tick(5000)
    await expect(port.step(worker.signal)).rejects.toThrow('the worker stopped')
    expect(port.checkpoints[0]).toMatchObject({ state: 'Upload', fetchedAt: new Date(fetchedAt.getTime() + 5000) })
    port.tick(60_000)
    await port.runner.segment(null, 'r4', new AbortController().signal)

    expect(uploads).toBe(1)
    expect(port.run('r4')).toMatchObject({ status: 'succeeded', output: { ref: 'files/1', fetched: '2026-11-04T12:00:05.000Z' } })
  })

  it('gives $now the time of the last checkpoint, the same after a crash', async () => {
    const worker = new AbortController()
    const seen: unknown[] = []
    const port = memoryRunner({ write: async () => 'ok', show: reading(async (args) => void seen.push(args)), slow: crashingOnce(worker, 'done') })
    await port.start('r6', definition({
      Before: { Type: 'Task', Resource: 'show', Arguments: { at: '{% $now() %}' }, Next: 'Write' },
      Write: { Type: 'Task', Resource: 'write', Next: 'After' },
      After: { Type: 'Task', Resource: 'show', Arguments: { at: '{% $now() %}', ms: '{% $millis() %}' }, Next: 'Slow' },
      Slow: { Type: 'Task', Resource: 'slow', End: true },
    }), {})
    port.tick(1000)
    await expect(port.step(worker.signal)).rejects.toThrow('the worker stopped')
    port.tick(1000)
    await port.runner.segment(null, 'r6', new AbortController().signal)

    const written = { at: '2026-11-04T12:00:01.000Z', ms: Date.parse('2026-11-04T12:00:01Z') }
    expect(seen).toEqual([{ at: '2026-11-04T12:00:00.000Z' }, written, written])
  })

  it('gives each Map item running at once its own $random, the same when the run takes up again', async () => {
    const worker = new AbortController()
    const drawn: { item: number; r: number }[] = []
    let calls = 0
    const port = memoryRunner({
      use: reading(async (args, { signal }) => {
        drawn.push(args as { item: number; r: number })
        if (++calls !== 2) return args
        worker.abort(new Error('the worker stopped'))
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
      }),
    })
    await port.start('r7', definition({
      Each: {
        Type: 'Map',
        Items: '{% [1, 2] %}',
        ItemProcessor: {
          StartAt: 'Draw',
          States: {
            Draw: { Type: 'Pass', Assign: { item: '{% $states.input %}', r: '{% $random() %}' }, Next: 'Use' },
            Use: { Type: 'Task', Resource: 'use', Arguments: { item: '{% $item %}', r: '{% $r %}' }, End: true },
          },
        },
        End: true,
      },
    }), {})
    await expect(port.step(worker.signal)).rejects.toThrow('the worker stopped')
    await port.runner.segment(null, 'r7', new AbortController().signal)

    const [first, second] = drawn
    expect(first!.r).not.toBe(second!.r)
    expect(drawn.slice(2).sort((a, b) => a.item - b.item)).toEqual([first, second].sort((a, b) => a!.item - b!.item))
    expect(port.run('r7').status).toBe('succeeded')
  })

  it("saves where each Map item stands as the segment yields, so a later segment does not run an ended item's read again", async () => {
    const reads: number[] = []
    const port = memoryRunner({ get: reading(async (args) => new Promise((resolve) => setTimeout(() => resolve(reads.push(args as number)), 5))) }, { budgetMs: 1 })
    await port.start('r8', definition({
      Each: { Type: 'Map', Items: '{% [1, 2, 3] %}', MaxConcurrency: 1, ItemProcessor: { StartAt: 'Get', States: { Get: { Type: 'Task', Resource: 'get', Arguments: '{% $states.input %}', End: true } } }, End: true },
    }), {})
    await port.step()
    // However far the first segment got before its time was up, each item it ended is saved as ended.
    expect(port.checkpoints.map(({ scope, next }) => ({ scope, next }))).toEqual(reads.map((_, index) => ({ scope: `Each.0[${index}]`, next: null })))
    await port.drain()

    expect(reads).toEqual([1, 2, 3])
    expect(port.run('r8')).toMatchObject({ status: 'succeeded', output: [1, 2, 3] })
  })

  it("keeps one checkpoint per scope, and stops a segment that took the scope up from an older one", async () => {
    const write = async () => 'ok'
    const port = memoryRunner({ write })
    const machine = definition({
      A: { Type: 'Task', Resource: 'write', Next: 'Hold' },
      Hold: { Type: 'Wait', Seconds: 10, Next: 'B' },
      B: { Type: 'Task', Resource: 'write', End: true },
    })
    await port.start('r9', machine, {})
    await port.step()
    expect(port.checkpoints.map(({ state, seq, after }) => ({ state, seq, after }))).toEqual([{ state: 'Hold', seq: 1, after: 0 }])
    expect(port.writes).toEqual([1, 1])

    const stale = await runSegment({ runId: 'r9', definition: machine, input: {}, startedAt: port.now(), secrets: {}, redactor: secretRedactor([]), saved: [], save: (checkpoints) => port.store.save(null, 'r9', checkpoints), keep: async () => {}, tasks: { write }, signal: new AbortController().signal, now: port.now })
    expect(stale.kind).toBe('superseded')
    expect(port.checkpoints.map(({ state }) => state)).toEqual(['Hold'])
  })
})
