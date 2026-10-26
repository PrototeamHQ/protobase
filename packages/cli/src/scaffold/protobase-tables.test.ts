import { describe, expect, it } from 'vitest'
import type { DbColumn, DbTable } from '../db/model'
import type { ExistingResource } from './existing-config'
import { planScaffold } from './plan'
import { protobaseSchemas } from './protobase-tables'

const column = (name: string) => ({ name, position: 1, typeName: 'text', formatted: 'text', isEnum: false, enumValues: [], notNull: true, identity: false, identityAlways: false, generated: false }) as DbColumn

const table = (schema: string, name: string, columns = ['id']) =>
  ({ schema, name, kind: 'table', columns: columns.map(column), foreignKeys: [], checks: [], indexes: [{ name: `${name}_pkey`, columns: ['id'], unique: true, primary: true, partial: false, method: 'btree', opclasses: ['text_ops'] }] }) as DbTable

// A store with its sessions pointing at its user table, `user` unless the app names it otherwise.
const store = (schema: string, user = 'user', more: string[] = []) => [
  table(schema, user),
  { ...table(schema, 'session'), foreignKeys: [{ columns: ['user_id'], refSchema: schema, refTable: user, refColumns: ['id'] }] },
  ...['account', 'verification', 'jwks', ...more].map((name) => table(schema, name)),
]
const queue = ['job', 'version', 'queue'].map((name) => table('jobs', name))

const plan = (tables: DbTable[], target = {}, existing: ExistingResource[] = []) =>
  planScaffold({ tables, existing, configDir: '/config', target, excludes: [], decide: async (proposal) => proposal, ui: ['names', 'list'], readText: async () => undefined })

const scaffolded = async (tables: DbTable[], target = {}) =>
  (await plan(tables, target)).changes.map((change) => change.path).filter((file) => file.endsWith('data.ts'))

describe('protobaseSchemas', () => {
  it("finds the auth store in auth, Better Auth's core tables in another schema, and pg-boss in jobs", () => {
    const found = protobaseSchemas([...store('auth'), ...store('identity'), ...queue, table('public', 'orders')], {})
    expect(found.map(({ schema, what }) => [schema, what])).toEqual([['auth', 'auth store'], ['identity', 'auth store'], ['jobs', 'job queue']])
  })

  it("leaves an app's own jobs schema and an app's own session table alone", () => {
    expect(protobaseSchemas([table('jobs', 'applicants'), table('app', 'session')], {})).toEqual([])
  })

  it('takes only the store tables out of public: those its migrations make, its record and its user table, however named', () => {
    const [found] = protobaseSchemas([...store('public', 'people', ['organization', 'member', 'oauth_client', 'auth_migrations']), table('public', 'orders'), table('public', 'user')], {})
    expect(found!.tables.map((each) => each.name)).toEqual(['people', 'session', 'account', 'verification', 'jwks', 'organization', 'member', 'oauth_client', 'auth_migrations'])
  })

  it('finds a store by its record of migrations, and no store in tables merely named like its own', () => {
    expect(protobaseSchemas([table('identity', 'auth_migrations'), table('identity', 'member')], {}).map(({ schema }) => schema)).toEqual(['identity'])
    expect(protobaseSchemas(['session', 'account', 'verification'].map((name) => table('public', name)), {})).toEqual([])
  })
})

describe('scaffold of a database with Protobase in it', () => {
  it('writes no resources for the auth store or the job queue, and says it skipped them', async () => {
    const result = await plan([...store('auth'), ...queue, table('public', 'orders'), table('public', 'session')])
    expect(result.changes.map((change) => change.path).filter((file) => file.endsWith('data.ts'))).toEqual(['/config/orders/data.ts', '/config/session/data.ts'])
    expect(result.skipped.map((each) => each.schema)).toEqual(['auth', 'jobs'])
  })

  it('never scaffolds the auth store, even when the target names its schema or one of its tables', async () => {
    expect(await scaffolded(store('auth'), { schema: 'auth' })).toEqual([])
    expect(await scaffolded([...store('public'), table('public', 'orders')], { schema: 'public' })).toEqual(['/config/orders/data.ts'])
    expect(await scaffolded([...store('public'), table('public', 'orders')], { schema: 'public', table: 'session' })).toEqual([])
  })

  it('still scaffolds the job queue when the target names its schema', async () => {
    expect(await scaffolded(queue, { schema: 'jobs' })).toContain('/config/job/data.ts')
  })

  it('warns about a resource an earlier run made over the auth store', async () => {
    const result = await plan(store('auth'), {}, [{ name: 'account', table: 'auth.account', dir: 'account', identifier: 'account', fields: [], text: '' }])
    expect(result.warnings).toEqual(["auth.account: one of Protobase's own tables, which account/data.ts declares; remove that resource"])
  })
})
