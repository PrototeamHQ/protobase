import { describe, expect, it } from 'vitest'
import type { TaskContext } from '../run/port'
import { memoryCache } from '../run/cache/memory-cache'
import { secretNamer } from '../run/cache/secret-names'
import { cachePlan } from './cache-plan'
import { errorOutput } from '../run/errors'
import { ConnectionError } from './connection-error'
import type { PluginServices } from './context'
import { stepHandlers } from './step-handlers'
import type { StepType } from './types'

const services = { records: {}, files: {}, storage: {}, fetch: async () => new Response() } as unknown as PluginServices
const type = (connection: string): StepType => ({ label: 'Get', description: 'Gets.', input: { type: 'object' }, connection, cache: { choice: 'hidden', ttl: '1 hour' }, run: async ({ input }) => ({ url: input.url, n: Math.random() }) })

// A handler for `t:get` over one cache, whose connection answers as `signedIn` says at each call.
const setup = () => {
  const memory = memoryCache()
  const state = { signedIn: true, tokens: 0 }
  const accessToken = async () => {
    state.tokens++
    if (!state.signedIn) throw new ConnectionError('not_connected', 'No connection')
    return 'token'
  }
  const handler = stepHandlers([{ name: 't', label: 'T', steps: { get: type('account') } }], { services: () => services, connection: () => ({ accessToken }) })['t:get']!
  const task: TaskContext = { runId: 'run', signal: new AbortController().signal, idempotencyKey: 'k', log: () => {}, redact: (text) => text, secret: () => {}, cache: { store: memory.store, setting: undefined, nameSecrets: secretNamer({}), redact: (value) => value } }
  return { call: (input: unknown) => handler(input, task), memory, state }
}

describe('a cached step type with a connection', () => {
  it('checks its connection before it looks up the cache, so a hit never outlives the sign-in', async () => {
    const { call, memory, state } = setup()
    const first = await call({ url: 'a' })
    expect(await call({ url: 'a' })).toEqual(first)
    expect(state.tokens).toBe(2)
    state.signedIn = false
    const refused = await call({ url: 'a' }).catch((error: unknown) => error)
    expect(refused).toMatchObject({ code: 'not_connected' })
    expect(errorOutput(refused)).toEqual({ Error: 'States.TaskFailed', Cause: 'No connection' })
    expect(memory.calls).toEqual({ shapes: 2, lookup: 1, write: 1 })
  })

  it("keys each type on its own connection's name, not on its plugin alone", () => {
    const cache = setup().memory.store
    const task = { setting: undefined, store: cache, nameSecrets: secretNamer({}), redact: <T>(value: T) => value }
    const identity = (connection: string) => (cachePlan('t:get', type(connection), {}, task) as { identity: unknown }).identity
    expect(identity('account')).toMatchObject({ connection: 't:account' })
    expect(identity('other')).toMatchObject({ connection: 't:other' })
    expect((cachePlan('t:get', type('other'), {}, { ...task, setting: true }) as { identity: unknown }).identity).toMatchObject({ connection: 't:other' })
  })
})
