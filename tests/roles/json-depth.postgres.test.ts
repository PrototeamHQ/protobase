import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineRoles, f, maxJsonDepth, resource } from '@protobase/schema'
import { createAdmin, defineFunction, type FunctionContext } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import { as, testAuthenticator } from '../../test-support/server'

const documents = resource('documents')
  .table('documents')
  .fields({ id: f.integer().readOnly(), payload: f.json(), extra: f.json().optional() })
  .primaryKey((r) => r.id)

const roles = defineRoles<'documents'>({ admin: ['*'], reader: ['documents.read'] })

// Built as text: JSON.stringify overflows on a value this deep, as z.json() did.
const nested = (depth: number) => '['.repeat(depth) + ']'.repeat(depth)
const deep = nested(100_000)
const body = (fields: Record<string, string>) => `{${Object.entries(fields).map(([name, value]) => `"${name}":${value}`).join(',')}}`

// A deep value from outside the app, such as a JSON answer a workflow step parsed, written through a function's records.
const store = defineFunction(async (_request: Request, { records }: FunctionContext) => Response.json(await records.create('documents', { payload: JSON.parse(deep) })))

describe.skipIf(!(await postgresTemplateReady('empty')))('a JSON field nested past the depth limit', () => {
  let pg: PostgresDatabase
  let app: ReturnType<typeof createAdmin>

  beforeAll(async () => {
    pg = await openPostgresDatabase('empty')
    await pg.exec('create table documents (id integer generated always as identity primary key, payload jsonb not null, extra jsonb)')
    app = createAdmin({ resources: [documents], db: pg.db, authenticate: testAuthenticator, options: { roles }, functions: { store } })
  })
  afterAll(async () => {
    await pg?.close()
  })

  const send = (method: string, path: string, text: string, role = 'admin') =>
    app.request(`/api/v1/documents${path}`, { method, body: text, headers: as(undefined, role, { 'content-type': 'application/json', 'if-match': '*' }) })
  const count = async () => Number((await pg.db.selectFrom('documents').select((e) => e.fn.countAll().as('n')).executeTakeFirstOrThrow()).n)
  const refusal = async (response: Response) => {
    const text = await response.text()
    expect(response.status).toBe(400)
    expect(text.length).toBeLessThan(1_000)
    const problem = JSON.parse(text)
    return { type: problem.type, fields: problem.errors.map((error: { field: string }) => error.field) }
  }
  const invalid = (...fields: string[]) => ({ type: 'urn:protobase:problem:invalid-record', fields })

  it('refuses a create nested 100,000 levels with a 400 naming the field and writes nothing', async () => {
    expect(await refusal(await send('POST', '', body({ payload: deep })))).toEqual(invalid('payload'))
    expect(await count()).toBe(0)
  })

  it('names the field that is too deep, not another JSON field', async () => {
    expect(await refusal(await send('POST', '', body({ payload: '[1]', extra: deep })))).toEqual(invalid('extra'))
    expect(await count()).toBe(0)
  })

  it('stores and reads back values of 64 levels and at the limit', async () => {
    for (const depth of [64, maxJsonDepth]) {
      const created = await send('POST', '', body({ payload: nested(depth), extra: '{"a":1}' }))
      expect(created.status).toBe(201)
      const { id } = await created.json()
      const read = await app.request(`/api/v1/documents/${id}`, { headers: as(undefined) })
      expect(await read.json()).toMatchObject({ payload: JSON.parse(nested(depth)), extra: { a: 1 } })
    }
  })

  it('refuses an update nested 100,000 levels and leaves the record as it was', async () => {
    const { id } = await (await send('POST', '', body({ payload: '{"kept":true}' }))).json()
    expect(await refusal(await send('PATCH', `/${id}`, body({ payload: deep })))).toEqual(invalid('payload'))
    expect((await (await app.request(`/api/v1/documents/${id}`, { headers: as(undefined) })).json()).payload).toEqual({ kept: true })
  })

  it('refuses callers who may not write before it reads the value, and goes on answering', async () => {
    const before = await count()
    const anonymous = await app.request('/api/v1/documents', { method: 'POST', body: body({ payload: deep }), headers: { 'content-type': 'application/json' } })
    expect(anonymous.status).toBe(401)
    expect((await send('POST', '', body({ payload: deep }), 'reader')).status).toBe(403)
    expect((await app.request('/api/v1/documents', { headers: as(undefined, 'reader') })).status).toBe(200)
    expect(await count()).toBe(before)
  })

  it('refuses the same value written through records in a function', async () => {
    const before = await count()
    expect(await refusal(await app.request('/api/functions/store', { method: 'POST', headers: as(undefined) }))).toEqual(invalid('payload'))
    expect(await count()).toBe(before)
  })
})
