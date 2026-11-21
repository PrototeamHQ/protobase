import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely'
import { describe, expect, it } from 'vitest'
import { createAdmin } from '@protobase/server'
import { accountManagers, customers, orders } from './lookups'

const db = new Kysely<any>({
  dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(), createIntrospector: (kysely) => new PostgresIntrospector(kysely), createQueryCompiler: () => new PostgresQueryCompiler() },
})

describe('the lookups example', () => {
  it('declares read-only lookup fields that fit their linked fields', () => {
    expect(orders.toModel().lookups!.customer_name).toMatchObject({ readOnly: true, nullable: true, lookup: { via: 'customer_id', field: 'name' } })
    expect(customers.toModel().lookups!.manager_name).toMatchObject({ lookup: { from: 'account_managers', via: 'customer_id', field: 'name' } })
    expect(() => createAdmin({ resources: [customers, accountManagers, orders], db, authenticate: () => ({ user: { id: 1, roles: ['admin'] } }) })).not.toThrow()
  })
})
