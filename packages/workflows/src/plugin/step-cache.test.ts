import { types } from 'node:util'
import { describe, expect, it } from 'vitest'
import type { TaskContext } from '../run/port'
import { cacheKey } from '../run/cache/cache-key'
import { memoryCache } from '../run/cache/memory-cache'
import { secretNamer } from '../run/cache/secret-names'
import { StepError } from '../run/errors'
import type { StepCache } from './cache-types'
import type { PluginServices, StepContext } from './context'
import { stepHandlers } from './step-handlers'
import type { StepType } from './types'

const services = { records: { get: async () => ({}) }, files: { keep: async () => ({}), read: async () => ({ name: 'a.txt', bytes: new Uint8Array() }) }, fetch: async () => new Response() } as unknown as PluginServices

// A step type `t:get` whose calls are counted, and a handler for it over a cache whose runs belong to tenants by run id.
const setup = (cache: StepCache | undefined, run: (context: StepContext) => unknown = ({ input }) => ({ url: input.url, n: Math.random() }), options: { secrets?: Record<string, string>; clock?: { at: Date } } = {}) => {
  const clock = options.clock ?? { at: new Date('2026-11-06T12:00:00Z') }
  let secrets = options.secrets ?? {}
  const memory = memoryCache({ whoOf: (runId) => runId.split('/')[0], secrets: () => secrets, now: () => clock.at })
  const seen: StepContext[] = []
  const type: StepType = { label: 'Get', description: 'Gets.', input: { type: 'object' }, ...(cache && { cache }), run: async (context) => (seen.push(context), run(context)) }
  const handler = stepHandlers([{ name: 't', label: 'T', steps: { get: type } }], { services: () => services, connection: () => ({ accessToken: async () => 'x' }) })['t:get']!
  const call = async (input: unknown, { runId = 'tenant-a/run', setting }: { runId?: string; setting?: boolean } = {}) => {
    const logs: string[] = []
    const task: TaskContext = { runId, signal: new AbortController().signal, idempotencyKey: 'k', log: (line) => void logs.push(line), redact: (text) => text, secret: () => {}, cache: { store: memory.store, setting, nameSecrets: secretNamer(secrets), redact: (value) => value } }
    return { output: await handler(input, task), logs }
  }
  return { call, memory, seen, clock, setSecrets: (next: Record<string, string>) => void (secrets = next) }
}

const returning: StepCache = { choice: 'hidden', ttl: '1 hour' }

describe('a step type without a cache', () => {
  it('looks up, keeps and tracks nothing', async () => {
    const { call, memory, seen } = setup(undefined)
    await call({ url: 'a' })
    await call({ url: 'a' })
    expect(memory.calls).toEqual({ shapes: 0, lookup: 0, write: 0 })
    expect(seen).toHaveLength(2)
    expect(types.isProxy(seen[0]!.input)).toBe(false)
  })

  it('caches its whole input once a workflow forces it on, for an hour', async () => {
    const { call, seen, clock } = setup(undefined)
    const first = await call({ url: 'a', other: 1 }, { setting: true })
    expect((await call({ url: 'a', other: 1 }, { setting: true })).output).toEqual(first.output)
    expect((await call({ url: 'a', other: 2 }, { setting: true })).output).not.toEqual(first.output)
    clock.at = new Date(clock.at.getTime() + 3601_000)
    expect((await call({ url: 'a', other: 1 }, { setting: true })).output).not.toEqual(first.output)
    expect(seen).toHaveLength(3)
  })
})

describe('a step type that returns hits', () => {
  it('returns the earlier result of the same input without calling its code, from another run', async () => {
    const { call, seen } = setup(returning)
    const first = await call({ url: 'a' }, { runId: 'tenant-a/one' })
    const second = await call({ url: 'a' }, { runId: 'tenant-a/two' })
    expect(second.output).toEqual(first.output)
    expect(seen).toHaveLength(1)
    expect(second.logs[0]).toContain('An earlier result from 2026-11-06T12:00:00.000Z')
  })

  it('keys on the values the step read only, and on its tenant', async () => {
    const { call, seen } = setup(returning)
    const first = await call({ url: 'a', unread: 1 })
    expect((await call({ url: 'a', unread: 2 })).output).toEqual(first.output)
    expect((await call({ url: 'b', unread: 1 })).output).not.toEqual(first.output)
    expect((await call({ url: 'a', unread: 1 }, { runId: 'tenant-b/run' })).output).not.toEqual(first.output)
    expect(seen).toHaveLength(3)
  })

  it('keys on all of a value the step serialised', async () => {
    const { call } = setup(returning, ({ input }) => ({ body: JSON.stringify(input.body), n: Math.random() }))
    const first = await call({ body: { a: 1, b: 2 } })
    expect((await call({ body: { a: 1, b: 2 } })).output).toEqual(first.output)
    expect((await call({ body: { a: 1, b: 3 } })).output).not.toEqual(first.output)
  })

  it('keys on an input value it hands back in its result', async () => {
    const { call, seen } = setup(returning, ({ input }) => ({ headers: input.headers, n: Math.random() }))
    const first = await call({ headers: { accept: 'text/plain' } })
    expect((await call({ headers: { accept: 'application/json' } })).output).not.toEqual(first.output)
    expect(seen).toHaveLength(2)
  })

  it('keeps no failure', async () => {
    const { call, memory } = setup(returning, () => {
      throw new StepError('T.Down', 'down')
    })
    await expect(call({ url: 'a' })).rejects.toThrow('T.Down')
    expect(memory.calls.write).toBe(0)
  })

  it('keeps no call that returned nothing, so a later call returns nothing too', async () => {
    const { call, memory, seen } = setup(returning, () => undefined)
    await call({ url: 'a' })
    expect((await call({ url: 'a' })).output).toBeUndefined()
    expect(seen).toHaveLength(2)
    expect(memory.calls.write).toBe(0)
  })

  it('keeps no result of a call that acted as someone its key does not hold', async () => {
    const { call, memory } = setup(returning, async ({ records }) => records.get('orders', 1))
    expect((await call({ url: 'a' })).logs).toContain('The result was not cached: the step used records')
    expect(memory.calls.write).toBe(0)
  })

  it("keeps no result of a call that read a file of its run, even forced on", async () => {
    const { call, memory } = setup(returning, async ({ files }) => files.read({ uri: 'f' }, 'file'))
    expect((await call({ url: 'a' })).logs).toContain('The result was not cached: the step used files')
    await call({ url: 'a' }, { setting: true })
    const forced = setup(undefined, async ({ records }) => records.get('orders', 1))
    await forced.call({ url: 'a' }, { setting: true })
    const files = setup(undefined, async ({ files }) => files.read({ uri: 'f' }, 'file'))
    await files.call({ url: 'a' }, { setting: true })
    expect(memory.calls.write + files.memory.calls.write).toBe(0)
    expect(forced.memory.calls.write).toBe(1)
  })

  it('keys on all of the headers a step hands on without reading them itself', async () => {
    const { call, seen } = setup(returning, async ({ input, fetch }) => (await fetch(String(input.url), { headers: input.headers as Record<string, string> }), { n: Math.random() }))
    const first = await call({ url: 'a', headers: { authorization: 'Bearer one' } })
    expect((await call({ url: 'a', headers: { authorization: 'Bearer one' } })).output).toEqual(first.output)
    expect((await call({ url: 'a', headers: { authorization: 'Bearer two' } })).output).not.toEqual(first.output)
    expect(seen).toHaveLength(2)
  })

  it('serves a result whose secret changed, saying so, and the next miss runs with the new value', async () => {
    const { call, seen, setSecrets } = setup(returning, ({ input }) => ({ auth: input.auth, url: input.url }), { secrets: { API_KEY: 'first-value-1234' } })
    await call({ auth: 'first-value-1234', url: 'a' })
    setSecrets({ API_KEY: 'second-value-5678' })
    const hit = await call({ auth: 'second-value-5678', url: 'a' })
    expect(hit.logs).toContain('The secret API_KEY changed since that result was kept')
    await call({ auth: 'second-value-5678', url: 'b' })
    expect(seen.at(-1)!.input.auth).toBe('second-value-5678')
  })
})

describe('a step type that is offered hits', () => {
  const offering: StepCache = { choice: 'force', use: 'offer', ttl: 600 }

  it('gets nothing on a miss, and the earlier result on a hit, which it may reuse as it is or cleaned', async () => {
    const { call, memory, seen } = setup(offering, ({ input, earlier, reuse }) => (earlier ? reuse({ ...(earlier.output as object), cleaned: true }) : { url: input.url }))
    expect((await call({ url: 'a' })).output).toEqual({ url: 'a' })
    expect(seen[0]!.earlier).toBeUndefined()
    expect((await call({ url: 'a' })).output).toEqual({ url: 'a', cleaned: true })
    expect(seen[1]!.earlier).toMatchObject({ output: { url: 'a' }, cached_at: '2026-11-06T12:00:00.000Z', secrets_changed: [] })
    expect(memory.calls.write).toBe(1)
  })

  it('may reject it, and its fresh result replaces it', async () => {
    let n = 0
    const { call, seen } = setup(offering, () => ({ n: ++n }))
    await call({ url: 'a' })
    expect((await call({ url: 'a' })).output).toEqual({ n: 2 })
    await call({ url: 'a' })
    expect(seen[2]!.earlier?.output).toEqual({ n: 2 })
  })

  it('gets an earlier result holding __proto__ as its own key, polluting nothing', async () => {
    const { call, memory, seen } = setup(offering, ({ earlier }) => earlier?.output ?? {})
    const polluting = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}')
    const key = (await cacheKey('t:get', { reads: [] }, {}, secretNamer({})))!.key
    await memory.store.write({ runId: 'tenant-a/run', type: 't:get', identity: { saver: false, enabler: false }, key, shape: { reads: [] }, output: polluting, seconds: 60, secrets: [] })
    await call({})
    const output = seen[0]!.earlier!.output as object
    expect(Object.hasOwn(output, '__proto__')).toBe(true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype)
  })
})

describe('the cache settings', () => {
  it('a switch is off by default, on when the workflow turns it on; false turns any cache off', async () => {
    const { call, memory } = setup({ choice: 'switch', ttl: 60 })
    await call({ url: 'a' })
    expect(memory.calls.lookup + memory.calls.write).toBe(0)
    await call({ url: 'a' }, { setting: true })
    expect(memory.calls.write).toBe(1)
    const off = setup(returning)
    await off.call({ url: 'a' }, { setting: false })
    expect(off.memory.calls).toEqual({ shapes: 0, lookup: 0, write: 0 })
  })

  it('`when` keeps a call out of the cache, unless the workflow forces it on', async () => {
    const { call, memory } = setup({ choice: 'force', ttl: 60, when: (input) => input.url !== 'private' })
    await call({ url: 'private' })
    expect(memory.calls.write).toBe(0)
    await call({ url: 'private' }, { setting: true })
    expect(memory.calls.write).toBe(1)
  })

  it('a time to live that is missing, zero, negative or unreadable keeps nothing', async () => {
    for (const ttl of [0, -1, Number.NaN, 'later', undefined]) {
      const { call, memory } = setup({ choice: 'hidden', ttl: ttl as number })
      expect((await call({ url: 'a' })).logs).toContain("The step type's cache gave no valid time to live; the step ran without the cache")
      expect(memory.calls.write).toBe(0)
    }
  })

  it('a key function that throws or gives nothing looks up and keeps nothing', async () => {
    for (const key of [() => { throw new Error('no') }, () => undefined, () => null, () => () => 1]) {
      const { call, memory, seen } = setup({ choice: 'hidden', ttl: 60, key })
      await call({ url: 'a' })
      await call({ url: 'a' })
      expect(seen).toHaveLength(2)
      expect(memory.calls.lookup + memory.calls.write).toBe(0)
    }
  })

  it('a custom key shares one result between inputs it gives the same value', async () => {
    const { call, seen } = setup({ choice: 'hidden', ttl: 60, key: (input) => String(input.url).toLowerCase() })
    await call({ url: 'A' })
    await call({ url: 'a' })
    expect(seen).toHaveLength(1)
  })
})

describe('a cache that fails', () => {
  it('leaves the step to run without it, and the step succeeds', async () => {
    const { call, memory, seen } = setup(returning)
    memory.store.shapes = async () => {
      throw new Error('down')
    }
    memory.store.write = async () => {
      throw new Error('down')
    }
    const result = await call({ url: 'a' })
    expect(result.output).toMatchObject({ url: 'a' })
    expect(result.logs).toEqual(['The cache could not be read; the step ran without it', 'The cache could not be written; the step ran without it'])
    expect(seen).toHaveLength(1)
  })
})
