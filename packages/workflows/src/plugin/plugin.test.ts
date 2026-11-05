import { describe, expect, it } from 'vitest'
import type { TaskContext } from '../run/port'
import { StepError } from '../run/errors'
import { ConnectionError } from './connection-error'
import type { PluginServices } from './context'
import { definePlugin } from './define-plugin'
import { loadPlugins } from './load-plugins'
import { stepHandlers } from './step-handlers'
import { triggerChecks } from './trigger-checks'
import { typeList } from './type-list'

const acme = definePlugin({
  name: 'acme',
  label: 'Acme',
  connections: { account: { label: 'Acme account', oauth: { authorization_url: 'https://acme.test/authorize', token_url: 'https://acme.test/token' } } },
  steps: {
    greet: {
      label: 'Greet',
      description: 'Says hello.',
      input: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
      errorPrefix: 'Acme',
      errors: { Busy: 'Acme is busy' },
      run: async ({ input, runId }) => ({ text: `Hello ${String(input.name)} from ${runId}` }),
    },
    token: { label: 'Token', description: 'Reads its token.', input: { type: 'object' }, connection: 'account', run: async ({ connection }) => connection!.accessToken() },
  },
  triggers: {
    new_order: { kind: 'ready', label: 'New order', description: 'Each order.', input: { type: 'object', properties: { shop: { type: 'string' } } }, check: (input) => (input.shop === 'closed' ? [{ field: 'shop', message: 'is closed' }] : []), ready: () => ({ resource: 'orders' }) },
  },
})

const task: TaskContext = { runId: 'run-1', signal: new AbortController().signal, idempotencyKey: 'run-1:0', log: () => {}, redact: (text) => text }
const services = {} as PluginServices
const notConnected = () => ({ accessToken: () => Promise.reject(new ConnectionError('not_connected', 'No sign-in')) })

describe('definePlugin and loadPlugins', () => {
  it('refuses a bad name, a bad key, an undeclared connection and two plugins of one name', () => {
    expect(() => definePlugin({ name: 'Acme', label: 'A' })).toThrow('lowercase letters')
    expect(() => definePlugin({ name: 'a', label: 'A', steps: { 'Do-it': acme.steps.greet } })).toThrow('"Do-it" is not a type key')
    expect(() => definePlugin({ name: 'a', label: 'A', steps: { x: { ...acme.steps.greet, connection: 'nope' } } })).toThrow('the connection "nope"')
    expect(() => loadPlugins([{ plugin: acme, source: '@acme/one' }, { plugin: acme, source: 'workflows/plugins/acme.ts' }])).toThrow('@acme/one and workflows/plugins/acme.ts')
  })
})

describe('typeList', () => {
  it('lists steps and triggers by id, with their errors and connection, marked by the app', () => {
    const list = typeList([acme], (type) => (type.connection ? 'no sign-in' : undefined))
    expect(list.map(({ id, kind, available }) => [id, kind, available])).toEqual([['acme:greet', 'step', true], ['acme:token', 'step', false], ['acme:new_order', 'ready', true]])
    expect(list[0]!.errors).toEqual({ 'Acme.Busy': 'Acme is busy' })
    expect(list[1]).toMatchObject({ reason: 'no sign-in', connection: { name: 'account', label: 'Acme account' } })
  })
})

describe('stepHandlers', () => {
  const handlers = stepHandlers([acme], { services: () => services, connection: notConnected })

  it('runs a step with its input and the run, and refuses an input that does not fit as <prefix>.InvalidArguments', async () => {
    await expect(handlers['acme:greet']!({ name: 'Ada' }, task)).resolves.toEqual({ text: 'Hello Ada from run-1' })
    await expect(handlers['acme:greet']!({}, task)).rejects.toEqual(new StepError('Acme.InvalidArguments', "Arguments must have required property 'name'"))
  })

  it("gives a step only its own declared connection, which names no other", async () => {
    await expect(handlers['acme:token']!({}, task)).rejects.toBeInstanceOf(ConnectionError)
  })
})

describe('triggerChecks', () => {
  it("checks a trigger's input against its schema, then its own check", () => {
    const check = triggerChecks([acme])['acme:new_order']!
    expect(check({ shop: 1 })).toEqual([{ field: 'shop', message: 'must be string' }])
    expect(check({ shop: 'closed' })).toEqual([{ field: 'shop', message: 'is closed' }])
    expect(check({ shop: 'open' })).toEqual([])
  })
})
