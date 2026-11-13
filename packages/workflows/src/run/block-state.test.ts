import { afterEach, describe, expect, it } from 'vitest'
import type { Definition, State } from '../definition/types'
import { limits } from '../limits'
import { memoryCache } from './cache/memory-cache'
import { StepError } from './errors'
import { memoryRunner } from './memory-port'
import type { CacheIdentity } from './cache/cache-port'
import type { TaskHandler, TaskHandlers } from './port'

const definition = (states: Record<string, State>, startAt = Object.keys(states)[0]!): Definition => ({ trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: startAt, States: states } })

// Fetches a signed link and stores the file: the stored file is what counts afterwards.
const fetchAndStore = (extra: Partial<State> = {}): State =>
  ({
    Type: 'Block',
    Arguments: { url: '{% $states.context.Execution.Input.url %}', name: '{% $states.context.Execution.Input.name %}' },
    Processor: {
      StartAt: 'Fetch',
      States: {
        Fetch: { Type: 'Task', Resource: 'fetch', Arguments: { url: '{% $states.context.Execution.Input.url %}' }, Assign: { body: '{% $states.result %}' }, Next: 'Store' },
        Store: { Type: 'Task', Resource: 'store', Arguments: { body: '{% $body %}', name: '{% $states.context.Execution.Input.name %}' }, End: true },
      },
    },
    Cache: { Ttl: '1 hour' },
    Assign: { file: '{% $states.result %}' },
    Next: 'Use',
    ...extra,
  }) as State

const flow = (block: State = fetchAndStore()) => definition({ Keep: block, Use: { Type: 'Succeed', Output: '{% $file %}' } })

const setup = (tasks: TaskHandlers = {}, { secrets, tenant = () => 't1', saver = () => 'u1' }: { secrets?: Record<string, string>; tenant?: (runId: string) => string; saver?: (runId: string) => string } = {}) => {
  const calls = { fetch: 0, store: 0 }
  let now = () => new Date()
  const whoOf = (runId: string, identity: CacheIdentity) => ({ tenant: tenant(runId), saver: saver(runId), identity })
  const cache = memoryCache({ whoOf, secrets: () => secrets ?? {}, now: () => now() })
  const port = memoryRunner(
    {
      fetch: async (args) => (calls.fetch++, `body of ${(args as { url: string }).url}`),
      store: async (args) => (calls.store++, { file: `files/${(args as { name: string }).name}` }),
      ...tasks,
    },
    { cache: cache.store, whoOf, ...(secrets && { secrets }) },
  )
  now = port.now
  return { port, cache, calls }
}

describe('a Block', () => {
  afterEach(() => {
    ;(limits as { blockRuns: number }).blockRuns = 1000
  })

  it('runs once as a run of its own, and a later run with the same reads gets its stored result without running it', async () => {
    const { port, calls } = setup()
    await port.start('a', flow(), { url: 'https://x.test/signed?sig=1', name: 'report.pdf' })
    await port.drain()
    await port.start('b', flow(), { url: 'https://x.test/signed?sig=1', name: 'report.pdf' })
    await port.drain()

    expect(calls).toEqual({ fetch: 1, store: 1 })
    expect(port.run('a')).toMatchObject({ status: 'succeeded', output: { file: 'files/report.pdf' } })
    expect(port.run('b')).toMatchObject({ status: 'succeeded', output: { file: 'files/report.pdf' } })
    const blockSteps = port.steps.filter((step) => step.state === 'Keep')
    expect(blockSteps.map((step) => [step.runId, step.run, step.recorded, step.reused])).toEqual([
      ['a', 'a~|0', true, undefined],
      ['b', 'a~|0', true, true],
    ])
    // The block's run keeps its own trace, of its own steps.
    expect(port.steps.filter((step) => step.runId === 'a~|0').map((step) => step.state)).toEqual(['Fetch', 'Store'])
    expect(port.run('a~|0')).toMatchObject({ blockOf: 'a', blockState: 'Keep', input: { url: 'https://x.test/signed?sig=1', name: 'report.pdf' } })
    expect(blockSteps[1]!.logs.map((line) => line.message)).toEqual([expect.stringMatching(/^An earlier result from /)])
  })

  it('is woken by its run as that ends, not at its wait time', async () => {
    const { port } = setup()
    const start = port.now().getTime()
    await port.start('a', flow(), { url: 'u1', name: 'n' })
    await port.drain()
    expect(port.run('a').status).toBe('succeeded')
    expect(port.now().getTime() - start).toBeLessThan(limits.blockWaitSeconds * 1000)
  })

  it('runs once when one run reaches it again with the same key', async () => {
    const { port, calls } = setup()
    await port.start('a', definition({
      Start: { Type: 'Pass', Assign: { round: 0 }, Next: 'Keep' },
      Keep: fetchAndStore({ Assign: { file: '{% $states.result %}', round: '{% $round + 1 %}' }, Next: 'Again' } as Partial<State>),
      Again: { Type: 'Choice', Choices: [{ Condition: '{% $round < 3 %}', Next: 'Keep' }], Default: 'Use' },
      Use: { Type: 'Succeed', Output: '{% $file %}' },
    }), { url: 'u1', name: 'n' })
    await port.drain()
    expect(port.run('a')).toMatchObject({ status: 'succeeded' })
    expect(calls.fetch).toBe(1)
    expect(port.steps.filter((step) => step.state === 'Keep')).toHaveLength(3)
  })

  it('runs again when a value only a later step of it reads changed, and not for a value none of its steps reads', async () => {
    const { port, calls } = setup()
    await port.start('a', flow(), { url: 'u1', name: 'one.pdf', unread: 1 })
    await port.drain()
    await port.start('b', flow(), { url: 'u1', name: 'two.pdf', unread: 1 })
    await port.drain()
    expect(calls.store).toBe(2)
    expect(port.run('b').output).toEqual({ file: 'files/two.pdf' })
    const unread = fetchAndStore({ Arguments: { url: '{% $states.context.Execution.Input.url %}', name: 'fixed', unread: '{% $states.context.Execution.Input.unread %}' } } as Partial<State>)
    await port.start('c', flow(unread), { url: 'u1', unread: 1 })
    await port.drain()
    await port.start('d', flow(unread), { url: 'u1', unread: 2 })
    await port.drain()
    expect(calls.store).toBe(3)
  })

  it('keeps a result that is empty, so a later run with the same key does not run it again', async () => {
    const { port, calls } = setup({ store: async () => void calls.store++ })
    await port.start('a', flow(), { url: 'u1', name: 'n' })
    await port.drain()
    await port.start('b', flow(), { url: 'u1', name: 'n' })
    await port.drain()
    expect(calls.store).toBe(1)
    expect(port.run('b')).toMatchObject({ status: 'succeeded', output: null })
  })

  it('fails when its output is over 256 KiB, with the size and none of the values in its error', async () => {
    const { port } = setup({ store: async () => 'v'.repeat(300 * 1024) })
    await port.start('a', flow(), { url: 'u1', name: 'n' })
    await port.drain()
    const run = port.run('a') as { status: string; error?: string; cause?: string }
    expect(run).toMatchObject({ status: 'failed', error: 'States.DataLimitExceeded' })
    expect(run.cause).toMatch(/is 307202 bytes as JSON, over the 256 KiB/)
    expect(JSON.stringify(port.steps)).not.toContain('vvvvvvvvvv')
  })

  it('starts one run per try: a resumed run finds it again, and a retry starts the next', async () => {
    let tries = 0
    const { port } = setup({
      store: async () => {
        tries++
        if (tries === 1) throw new StepError('Store.Down', 'down')
        return 'stored'
      },
    })
    const retried = fetchAndStore({ Retry: [{ ErrorEquals: ['Store.Down'], IntervalSeconds: 1, MaxAttempts: 1 }] } as Partial<State>)
    await port.start('a', flow(retried), { url: 'u1', name: 'n' })
    // The run's segment starts the block's run and waits; a second segment of it before that ends starts no other.
    await port.step()
    await port.runner.segment(null, 'a', new AbortController().signal)
    expect(await port.blocks.count(null, 'a')).toBe(1)
    await port.drain()
    expect(port.run('a')).toMatchObject({ status: 'succeeded', output: 'stored' })
    const blockRuns = port.steps.filter((step) => step.state === 'Keep').map((step) => [step.status, step.run])
    expect(blockRuns).toEqual([
      ['retrying', 'a~|0'],
      ['succeeded', 'a~|1'],
    ])
  })

  it("keeps no entry for a result that held a secret's value, so the next run gets it afresh", async () => {
    const secret = 'top-secret-token-value'
    const { port, cache, calls } = setup({}, { secrets: { API_TOKEN: secret } })
    const leaking = fetchAndStore()
    ;(leaking as { Processor: { States: Record<string, State> } }).Processor.States.Store = { Type: 'Pass', Output: '{% $states.context.Secrets.API_TOKEN %}', End: true }
    await port.start('a', flow(leaking), { url: 'u1', name: 'n' })
    await port.drain()
    await port.start('b', flow(leaking), { url: 'u1', name: 'n' })
    await port.drain()
    expect(calls.fetch).toBe(2)
    expect(JSON.stringify([...cache.entries])).not.toContain(secret)
    expect(port.steps.find((step) => step.runId === 'a' && step.state === 'Keep')!.logs.map((line) => line.message)).toContain("The result was not cached: its run's output held a secret")
  })

  it("fails on Arguments that hold a secret's value, which its run would keep", async () => {
    const secret = 'top-secret-token-value'
    const { port } = setup({}, { secrets: { API_TOKEN: secret } })
    await port.start('a', flow(fetchAndStore({ Arguments: { url: '{% $states.context.Secrets.API_TOKEN %}' } } as Partial<State>)), {})
    await port.drain()
    expect(port.run('a')).toMatchObject({ status: 'failed', error: 'States.Runtime' })
    expect(JSON.stringify(port.run('a'))).not.toContain(secret)
  })

  it('runs again once a secret its steps read changed, and its entry holds no secret value', async () => {
    const secrets = { API_TOKEN: 'first-token-value' }
    const { port, cache, calls } = setup({}, { secrets })
    const reading = fetchAndStore()
    ;(reading as { Processor: { States: Record<string, State> } }).Processor.States.Fetch = { Type: 'Task', Resource: 'fetch', Arguments: { url: '{% $states.context.Execution.Input.url %}', token: '{% $states.context.Secrets.API_TOKEN %}' }, Assign: { body: '{% $states.result %}' }, Next: 'Store' }
    await port.start('a', flow(reading), { url: 'u1', name: 'n' })
    await port.drain()
    await port.start('b', flow(reading), { url: 'u1', name: 'n' })
    await port.drain()
    expect(calls.fetch).toBe(1)
    secrets.API_TOKEN = 'second-token-value'
    await port.start('c', flow(reading), { url: 'u1', name: 'n' })
    await port.drain()
    expect(calls.fetch).toBe(2)
    // The memory store keeps the secrets' values beside an entry to tell a change; the database keeps keyed fingerprints.
    expect(JSON.stringify([...cache.entries].map(([key, entry]) => [key, entry.output]))).not.toMatch(/first-token-value|second-token-value/)
  })

  it("never serves another tenant's or another block's entry, nor an expired one", async () => {
    const tenants: Record<string, string> = { a: 't1', b: 't2' }
    const { port, calls } = setup({}, { tenant: (runId) => tenants[runId] ?? 't1' })
    await port.start('a', flow(), { url: 'u1', name: 'n' })
    await port.drain()
    await port.start('b', flow(), { url: 'u1', name: 'n' })
    await port.drain()
    expect(calls.fetch).toBe(2)
    // Another block reading the same values.
    const other = fetchAndStore()
    ;(other as { Processor: { States: Record<string, State> } }).Processor.States.Store = { Type: 'Task', Resource: 'store', Arguments: { body: '{% $body %}', name: '{% $states.context.Execution.Input.name %}', copy: true }, End: true }
    await port.start('c', flow(other), { url: 'u1', name: 'n' })
    await port.drain()
    expect(calls.fetch).toBe(3)
    port.tick(3601 * 1000)
    await port.start('d', flow(), { url: 'u1', name: 'n' })
    await port.drain()
    expect(calls.fetch).toBe(4)
  })

  it('runs again when an account its steps sign in with can no longer be used', async () => {
    let usable = true
    let fetched = 0
    const fetch: TaskHandler = Object.assign(async () => (fetched++, 'body'), { connected: async () => usable })
    const { port } = setup({ fetch })
    await port.start('a', flow(), { url: 'u1', name: 'n' })
    await port.drain()
    usable = false
    await port.start('b', flow(), { url: 'u1', name: 'n' })
    await port.drain()
    expect(fetched).toBe(2)
  })

  it('fails once its run started the most runs of blocks one run may', async () => {
    ;(limits as { blockRuns: number }).blockRuns = 1
    const { port } = setup()
    await port.start('a', definition({
      Start: { Type: 'Pass', Assign: { round: 0 }, Next: 'Keep' },
      Keep: fetchAndStore({ Arguments: { url: '{% $string($round) %}', name: 'n' }, Assign: { file: '{% $states.result %}', round: '{% $round + 1 %}' }, Next: 'Again' } as Partial<State>),
      Again: { Type: 'Choice', Choices: [{ Condition: '{% $round < 3 %}', Next: 'Keep' }], Default: 'Use' },
      Use: { Type: 'Succeed' },
    }), {})
    await port.drain()
    expect(port.run('a')).toMatchObject({ status: 'failed', error: 'States.DataLimitExceeded' })
    expect((port.run('a') as { cause?: string }).cause).toContain('(1)')
  })

  describe('reached by two runs at the same moment', () => {
    const together = async (port: ReturnType<typeof setup>['port'], runs: Record<string, { url: string; name: string }>, block = fetchAndStore()) => {
      for (const [id, input] of Object.entries(runs)) await port.start(id, flow(block), input)
      await port.drain()
    }

    it('runs once, and both runs take its result, each step linking to the one run', async () => {
      const { port, calls } = setup()
      await together(port, { a: { url: 'u1', name: 'n' }, b: { url: 'u1', name: 'n' } })
      expect(calls).toEqual({ fetch: 1, store: 1 })
      expect(port.run('a')).toMatchObject({ status: 'succeeded', output: { file: 'files/n' } })
      expect(port.run('b')).toMatchObject({ status: 'succeeded', output: { file: 'files/n' } })
      expect(port.steps.filter((step) => step.state === 'Keep').map((step) => [step.runId, step.run])).toEqual([
        ['a', 'a~|0'],
        ['b', 'a~|0'],
      ])
    })

    it('runs once for the items of a For each that reach it together', async () => {
      const { port, calls } = setup()
      const item = { StartAt: 'Keep', States: { Keep: fetchAndStore({ Next: undefined, End: true, Assign: undefined } as Partial<State>) } }
      await port.start('a', definition({ Each: { Type: 'Map', Items: '{% [1, 2, 3] %}', ItemProcessor: item, End: true } } as Record<string, State>), { url: 'u1', name: 'n' })
      await port.drain()
      expect(port.run('a')).toMatchObject({ status: 'succeeded', output: [{ file: 'files/n' }, { file: 'files/n' }, { file: 'files/n' }] })
      expect(calls.fetch).toBe(1)
      expect(await port.blocks.count(null, 'a')).toBe(1)
      expect((await port.blocks.waiters(null, port.steps.find((step) => step.state === 'Keep')!.run!)).length).toBe(2)
    })

    it("never joins another tenant's run, nor one of another saver", async () => {
      const tenants: Record<string, string> = { b: 't2' }
      const savers: Record<string, string> = { c: 'u2' }
      const { port, calls } = setup({}, { tenant: (runId) => tenants[runId] ?? 't1', saver: (runId) => savers[runId] ?? 'u1' })
      await together(port, { a: { url: 'u1', name: 'n' }, b: { url: 'u1', name: 'n' }, c: { url: 'u1', name: 'n' } })
      expect(calls.fetch).toBe(3)
      expect(port.steps.filter((step) => step.state === 'Keep').map((step) => step.run)).toEqual(['a~|0', 'b~|0', 'c~|0'])
    })

    it('fails every run that joined a run that failed, and keeps nothing', async () => {
      let fail = true
      const { port, calls } = setup({ fetch: async () => (calls.fetch++, fail ? Promise.reject(new StepError('Fetch.Expired', 'The link expired')) : 'body') })
      await together(port, { a: { url: 'u1', name: 'n' }, b: { url: 'u1', name: 'n' } })
      expect(calls.fetch).toBe(1)
      expect(port.run('a')).toMatchObject({ status: 'failed', error: 'Fetch.Expired', cause: 'The link expired' })
      expect(port.run('b')).toMatchObject({ status: 'failed', error: 'Fetch.Expired', cause: 'The link expired' })
      fail = false
      await together(port, { c: { url: 'u1', name: 'n' } })
      expect(calls.fetch).toBe(2)
      expect(port.run('c')).toMatchObject({ status: 'succeeded' })
    })

    it('wakes only the runs that joined the run that ended', async () => {
      const { port, calls } = setup()
      await together(port, { a: { url: 'u1', name: 'n1' }, b: { url: 'u1', name: 'n1' }, c: { url: 'u2', name: 'n2' }, d: { url: 'u2', name: 'n2' } })
      expect(calls.fetch).toBe(2)
      expect([port.run('a').output, port.run('b').output, port.run('c').output, port.run('d').output]).toEqual([{ file: 'files/n1' }, { file: 'files/n1' }, { file: 'files/n2' }, { file: 'files/n2' }])
      expect(await port.blocks.waiters(null, 'a~|0')).toEqual(['b'])
      expect(await port.blocks.waiters(null, 'c~|0')).toEqual(['d'])
    })

    it('runs on each visit when it keeps no result', async () => {
      const { port, calls } = setup()
      await together(port, { a: { url: 'u1', name: 'n' }, b: { url: 'u1', name: 'n' } }, fetchAndStore({ Cache: {} } as Partial<State>))
      expect(calls.fetch).toBe(2)
    })

    it('takes the result of a run that ended as it joined it, without waiting to be woken', async () => {
      const { port } = setup()
      const start = port.blocks.start
      port.blocks.start = async (db, run) => {
        const got = await start(db, run)
        if (!got?.joined) return got
        await port.store.update(null, got.id, { status: 'succeeded', output: { file: 'files/early' }, blanked: false })
        return port.blocks.find(null, run.parent, run.visit)
      }
      await port.start('a', flow(), { url: 'u1', name: 'n' })
      await port.start('b', flow(), { url: 'u1', name: 'n' })
      await port.step()
      await port.step()
      expect(port.run('b')).toMatchObject({ status: 'succeeded', output: { file: 'files/early' } })
    })

    it('starts its own run when an account its steps sign in with can no longer be used by the time the joined run ends', async () => {
      let usable = true
      let fetched = 0
      const fetch: TaskHandler = Object.assign(async () => (fetched++, 'body'), { connected: async () => usable })
      const { port } = setup({ fetch })
      await port.start('a', flow(), { url: 'u1', name: 'n' })
      await port.start('b', flow(), { url: 'u1', name: 'n' })
      for (const _ of ['a', 'b', 'a~|0']) await port.step()
      usable = false
      await port.drain()
      expect(fetched).toBe(2)
      expect(port.steps.filter((step) => step.state === 'Keep').map((step) => [step.runId, step.run])).toEqual([
        ['a', 'a~|0'],
        ['b', 'b~|0'],
      ])
    })
  })

  it("is held back in a replay, giving what the replayed run's block gave; its own run replays by itself", async () => {
    const { port, calls } = setup()
    await port.start('a', flow(), { url: 'u1', name: 'n' })
    await port.drain()
    await port.replay('r', 'a', flow())
    await port.drain()
    expect(port.run('r')).toMatchObject({ status: 'succeeded', output: { file: 'files/n' } })
    expect(calls.fetch).toBe(1)
    await port.replay('rb', 'a~|0', flow())
    await port.drain()
    expect(port.run('rb')).toMatchObject({ status: 'succeeded', blockState: 'Keep' })
    expect(port.steps.filter((step) => step.runId === 'rb').map((step) => step.state)).toEqual(['Fetch', 'Store'])
  })
})
