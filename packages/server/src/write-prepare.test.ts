import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type DatabaseConnection, type Driver } from 'kysely'
import { describe, expect, it } from 'vitest'
import { f, FieldIssue, resource } from '@protobase/schema'
import type { Deps } from './deps'
import { HttpProblem } from './problem'
import { buildRegistry } from './registry'
import type { PipelineHook } from './types'
import { runWrite } from './write-pipeline'

// A database on one connection that logs what the write does, in order, and answers every statement with `stored`.
const recorder = (log: string[]) => {
  const stored = { id: 7, name: 'Shop', token: 'tok-1' }
  const connection: DatabaseConnection = {
    executeQuery: async (query) => {
      const verb = query.sql.trimStart().split(/\s/)[0]!.toLowerCase()
      log.push(verb === 'insert' || verb === 'update' ? `${verb} ${JSON.stringify(query.parameters)}` : verb)
      return { rows: [stored] as never[] }
    },
    streamQuery: () => {
      throw new Error('Not implemented: a write streams nothing')
    },
  }
  const driver: Driver = {
    init: async () => {},
    acquireConnection: async () => connection,
    beginTransaction: async () => void log.push('begin'),
    commitTransaction: async () => void log.push('commit'),
    rollbackTransaction: async () => void log.push('rollback'),
    releaseConnection: async () => {},
    destroy: async () => {},
  }
  return new Kysely<any>({
    dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => driver, createIntrospector: (k) => new PostgresIntrospector(k), createQueryCompiler: () => new PostgresQueryCompiler() },
  })
}

const shops = resource('shops')
  .table('shops')
  .fields({ id: f.integer().readOnly(), name: f.text(), token: f.text().readOnly() })
  .primaryKey((r) => r.id)

// The author the server sets from the caller
const authored = resource('shops')
  .table('shops')
  .fields({ id: f.integer().readOnly(), name: f.text(), token: f.text().readOnly(), author_id: f.text().readOnly() })
  .primaryKey((r) => r.id)
  .author((r) => r.author_id)

const served = (prepared: typeof shops | typeof authored, hooks: PipelineHook[] = []) => {
  const log: string[] = []
  const deps = { db: recorder(log), registry: buildRegistry([prepared]), accessOptions: {}, settingsResources: new Set(), hooks, writeChecks: [], statementTimeoutMs: 1000 } as unknown as Deps
  const write = (body: unknown) => runWrite(deps, deps.registry.find('shops')!, { user: { id: 'u1', roles: [] } }, { operation: 'create', body })
  return { log, write }
}

const outcome = (promise: Promise<unknown>) => promise.then(() => 'written', (error: unknown) => (error instanceof HttpProblem ? { status: error.status, extras: error.extras } : String(error)))

describe('.prepare() in the write pipeline', () => {
  it('runs inside the transaction, before the insert, which writes what it returns, then the write hooks', async () => {
    const { log, write } = served(
      shops.prepare((values, { operation, user, trx }) => {
        log.push(`prepare ${operation} ${String(user.id)} ${trx ? 'in trx' : ''}`)
        return { ...values, name: String(values.name).toLowerCase(), token: 'tok-1' }
      }),
      [async (event) => void log.push(`hook ${event.operation}`)],
    )
    expect(await outcome(write({ name: 'SHOP' }))).toBe('written')
    expect(log).toEqual(['begin', 'select', 'prepare create u1 in trx', 'insert ["shop","tok-1"]', 'hook create', 'commit'])
  })

  it('refuses with 422 naming the field for a FieldIssue, rolling back before anything is written', async () => {
    const { log, write } = served(shops.prepare(() => {
      throw new FieldIssue('name', 'Not a shop name')
    }))
    expect(await outcome(write({ name: '??' }))).toEqual({ status: 422, extras: { errors: [{ field: 'name', code: 'invalid-value', message: 'Not a shop name' }] } })
    expect(log).toEqual(['begin', 'select', 'rollback'])
  })

  it('rolls the insert back when a write hook after it throws', async () => {
    const { log, write } = served(shops.prepare((values) => ({ ...values, token: 'tok-1' })), [async () => {
      throw new Error('refused')
    }])
    expect(await outcome(write({ name: 'shop' }))).toBe('Error: refused')
    expect(log).toEqual(['begin', 'select', 'insert ["shop","tok-1"]', 'rollback'])
  })

  it('passes each hook what the one before returned', async () => {
    const { log, write } = served(shops.prepare((values) => ({ ...values, name: `${values.name}-a` })).prepare((values) => ({ ...values, name: `${values.name}-b`, token: 't' })))
    await write({ name: 'shop' })
    expect(log).toContain('insert ["shop-a-b","t"]')
  })

  it('sets the author after the hooks, which neither see it nor can drop it', async () => {
    const { log, write } = served(authored.prepare((values) => ({ name: values.name, token: Object.hasOwn(values, 'author_id') ? 'saw-author' : 't' })))
    expect(await outcome(write({ name: 'shop' }))).toBe('written')
    expect(log).toContain('insert ["shop","t","u1"]')
  })

  it('checks what it returns against the .validate() rules, refusing before anything is written', async () => {
    const named = shops.validate((r) => (r.name ? [] : [{ field: 'name', message: 'A shop has a name' }]))
    const { log, write } = served(named.prepare((values) => ({ ...values, name: '', token: 't' })))
    expect(await outcome(write({ name: 'shop' }))).toEqual({ status: 400, extras: { errors: [{ field: 'name', code: 'invalid-record', message: 'A shop has a name' }] } })
    expect(log).toEqual(['begin', 'select', 'rollback'])
  })

  it('stops at a value for a field the resource does not have', async () => {
    const { write } = served(shops.prepare((values) => ({ ...values, nothing: 1 }) as never))
    expect(await outcome(write({ name: 'shop' }))).toBe('Error: Resource "shops": .prepare() returned "nothing", which is not one of its fields')
  })
})
