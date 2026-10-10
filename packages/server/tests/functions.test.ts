import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAdmin, defineFunction, functionApp, readJson, type FunctionSource, type PipelineHook, type WriteEvent } from '@protobase/server'
import { allResources, as, createFixtureDb, json, testAuthenticator } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
beforeAll(async () => {
  fixture = await createFixtureDb()
})
afterAll(async () => {
  await fixture.db.destroy()
})

const serve = (functions: Record<string, FunctionSource>, hooks: PipelineHook[] = []) =>
  createAdmin({ resources: allResources, db: fixture.db, authenticate: testAuthenticator, functions, options: { writeHooks: hooks } })

const call = async (app: ReturnType<typeof serve>, path: string, init: RequestInit) => {
  const response = await app.request(path, init)
  return { status: response.status, body: await response.json() }
}

describe('API functions', () => {
  it('list records as the caller: their tenant and row filter, as in the REST API', async () => {
    const app = serve({ labels: defineFunction(async (_request, { records }) => Response.json(await records.list('labels', { order_by: 'id', fields: ['id', 'name'] }))) })
    const { status, body } = await call(app, '/api/functions/labels', { headers: as(1) })
    expect(status).toBe(200)
    expect(body.items.map((item: { name: string }) => item.name)).toEqual(['urgent', 'later'])
    expect(body.items[0]).toEqual({ id: 1, name: 'urgent', etag: expect.any(String), permissions: { update: true, delete: true } })
    expect((await call(app, '/api/functions/labels', { headers: as(2) })).body.items.map((item: { name: string }) => item.name)).toEqual(['other-org'])

    const open = serve({ companies: defineFunction(async (_request, { records }) => Response.json(await records.list('companies', { filter: 'revenue > 990', page_size: 5 }))) })
    const sales = await call(open, '/api/functions/companies', { headers: as(1, 'sales') })
    expect(new Set(sales.body.items.map((item: { status: string }) => item.status))).toEqual(new Set(['open']))
    expect(sales.body.items).toHaveLength(5)
  })

  it('write through the pipeline as the caller: tenant, validation, hooks and access rules', async () => {
    const seen: WriteEvent[] = []
    const app = serve({
      companies: defineFunction(async (request, { records }) => {
        const { name } = (await readJson(request)) as { name: string }
        const created = await records.create('companies', { name })
        const updated = await records.update('companies', created.record.id as number, { status: 'won' }, { etag: created.etag })
        await records.delete('companies', created.record.id as number, { etag: updated.etag })
        return Response.json(updated.record, { status: 201 })
      }),
    }, [async (event) => void seen.push(event)])

    const { status, body } = await call(app, '/api/functions/companies', json({ name: 'Initech' }, as(1)))
    expect(status).toBe(201)
    expect(body).toMatchObject({ name: 'Initech', organizationId: 1, status: 'won' })
    expect(seen.map((event) => [event.operation, event.user.id, event.tenant])).toEqual([['create', 'tester', 1], ['update', 'tester', 1], ['delete', 'tester', 1]])

    // Deleting a company needs the admin role: the caller's 403 is the function's answer, and the rest was written.
    const refused = await call(app, '/api/functions/companies', json({ name: 'Hooli' }, as(1, 'sales')))
    expect(refused).toMatchObject({ status: 403, body: { type: 'urn:protobase:problem:access-denied' } })
    expect((await call(app, '/api/functions/companies', json({ name: 'forbidden' }, as(1)))).status).toBe(400)
  })

  it('give the raw database to privileged work, past tenants and rules', async () => {
    const app = serve({ count: defineFunction(async (_request, { db }) => Response.json(await db.selectFrom('labels').select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirst())) })
    expect((await call(app, '/api/functions/count', { headers: as(1) })).body).toEqual({ count: 3 })
  })

  it('serve a Hono app as the caller, and need a token unless public', async () => {
    const labels = functionApp()
    labels.get('/:id', async (c) => c.json((await c.env.records.get('labels', c.req.param('id'))).record))
    const app = serve({ labels })

    expect((await call(app, '/api/functions/labels/1', { headers: as(1) })).body).toMatchObject({ name: 'urgent' })
    expect((await call(app, '/api/functions/labels/3', { headers: as(1) })).status).toBe(404)
    expect(await call(app, '/api/functions/labels/1', {})).toMatchObject({ status: 401, body: { type: 'urn:protobase:problem:unauthenticated' } })
  })

  it('live beside the system endpoints, while /api/v1 stays resources only', async () => {
    const app = serve({ hello: () => new Response('hi') })
    expect(await (await app.request('/api/functions/hello', { headers: as(1) })).text()).toBe('hi')
    expect(await call(app, '/api/v1/functions', { headers: as(1) })).toMatchObject({ status: 404, body: { detail: expect.stringContaining('functions') } })
    expect((await app.request('/api/meta', { headers: as(1) })).status).toBe(200)
  })
})
