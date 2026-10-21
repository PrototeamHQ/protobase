import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { createAdmin, defineFunction, type FunctionContext } from '@protobase/server'
import { as, testAuthenticator } from '../../test-support/server'
import { openSnapshotDb } from '../../test-support/sql-snapshot'

const roles = defineRoles<'vms'>({
  admin: ['*'],
  operator: ['vms.*'],
  read_only: ['*.read'],
})

const vms = resource('vms').table('vms').fields({ id: f.integer().readOnly(), state: f.enum(['stopped', 'running']) }).primaryKey((r) => r.id)

// Each sets VM 1's state through the caller's records.
const setState = (state: string) => async (_request: Request, { records }: FunctionContext) => Response.json(await records.update('vms', 1, { state }))

// A VM manager's functions: one nobody granted to anyone, one for whoever may update VMs, one needing all of vms.*.
describe('API functions in an app with roles', () => {
  let db: Kysely<any>
  let app: ReturnType<typeof createAdmin>

  beforeAll(async () => {
    const pg = await openSnapshotDb('empty')
    await pg.exec(`
      create table vms (id integer generated always as identity primary key, state text not null);
      insert into vms (state) values ('stopped');
    `)
    db = new Kysely({ dialect: pg.dialect })
    app = createAdmin({
      resources: [vms],
      db,
      authenticate: testAuthenticator,
      options: { roles },
      functions: {
        start: defineFunction(setState('running')),
        stop: defineFunction({ capability: 'vms.update' }, setState('stopped')),
        console: defineFunction({ capability: 'vms.*' }, () => new Response('console')),
      },
    })
  })
  afterAll(async () => {
    await db.destroy()
  })

  const call = async (name: string, role: string) => {
    const response = await app.request(`/api/functions/${name}`, { method: 'POST', headers: as(undefined, role) })
    return response.status
  }

  it('refuses every function to a read-only caller, whatever it was given', async () => {
    expect([await call('start', 'read_only'), await call('stop', 'read_only'), await call('console', 'read_only')]).toEqual([403, 403, 403])
    expect((await (await app.request('/api/v1/vms/1', { headers: as(undefined, 'read_only') })).json()).state).toBe('stopped')
  })

  it('opens a function without roles or a capability only to callers holding *', async () => {
    expect(await call('start', 'operator')).toBe(403)
    expect(await call('start', 'admin')).toBe(200)
    expect((await (await app.request('/api/v1/vms/1', { headers: as(undefined, 'admin') })).json()).state).toBe('running')
  })

  it('opens a function with a capability to callers whose roles hold all of it', async () => {
    expect([await call('stop', 'operator'), await call('console', 'operator'), await call('console', 'admin')]).toEqual([200, 200, 200])
    expect((await (await app.request('/api/v1/vms/1', { headers: as(undefined, 'operator') })).json()).state).toBe('stopped')
  })
})
