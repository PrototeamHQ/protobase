import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { as, json, testAuthenticator } from '../../../test-support/server'
import { createEmptyPg } from '../../../test-support/pglite-snapshot'

const contacts = resource('contacts')
  .table('contacts')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    organizationId: f.relation('organizations').filterable(),
    name: f.text(),
    phone: f.text().optional(),
    status: f.enum(['open', 'closed']).filterable(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .search((r) => [r.name, r.phone.digitsEnd()])
  .access({ list: ((ctx: { user: { roles: string[] } }) => (ctx.user.roles.includes('sales') ? 'status = "open"' : true)) as never })

let db: Kysely<any>
let app: ReturnType<typeof createAdmin>
beforeAll(async () => {
  const pg = await createEmptyPg()
  await pg.exec(`
    create table contacts (id integer primary key, organization_id integer not null, name text not null, phone text, status text not null);
    insert into contacts values
      (1, 1, 'Anouk de Vries', '+31 6 47069623', 'open'),
      (2, 1, 'Bram Smit', '+31-6-1234-9623', 'closed'),
      (3, 2, 'Chris Jansen', '+31 6 47069623', 'open'),
      (4, 1, 'Dewi 4706 Bakker', null, 'open');
  `)
  db = new Kysely({ dialect: new PGliteDialect(pg) })
  app = createAdmin({ resources: [contacts], db, authenticate: testAuthenticator })
})
afterAll(async () => { await db.destroy() })

const ids = async (response: Response) => {
  expect(response.status).toBe(200)
  return ((await response.json()).items as Array<{ id: number }>).map((item) => item.id).sort()
}
const listed = (filter: string, roles = 'admin') => app.request(`/api/v1/contacts?filter=${encodeURIComponent(filter)}`, { headers: as(1, roles) })
const searched = (filter: string, roles = 'admin') => app.request('/api/v1/contacts:search', json({ filter }, as(1, roles)))

describe('a search field matched by the end of its digits', () => {
  it('finds the end of a formatted number, in a list filter and in :search', async () => {
    for (const filter of ['search("9623")', '9623', 'search("+31 6 47069623")']) {
      expect(await ids(await listed(filter)), filter).toEqual(filter.includes('4706') ? [1] : [1, 2])
      expect(await ids(await searched(filter)), filter).toEqual(filter.includes('4706') ? [1] : [1, 2])
    }
  })

  it('does not match the start or the middle of the number', async () => {
    expect(await ids(await listed('search("+316")'))).toEqual([])
    expect(await ids(await listed('4706'))).toEqual([4])
    expect(await ids(await searched('search("+31 6 4706")'))).toEqual([])
  })

  it('keeps the tenant and the row filter', async () => {
    expect(await ids(await listed('9623', 'sales'))).toEqual([1])
    expect(await ids(await searched('47069623', 'sales'))).toEqual([1])
  })
})
