import { describe, expect, it } from 'vitest'
import { f, resource, type AnyField } from '@protobase/schema'
import { checkLookups } from './check-lookups'
import { buildRegistry } from './registry'

const customers = resource('customers').table('customers')
  .fields({ id: f.integer(), name: f.text().filterable(), tier: f.enum(['gold', 'silver']), secret: f.text().sensitive() })
  .primaryKey((r) => r.id)
const pairs = resource('pairs').table('pairs').fields({ a: f.integer(), b: f.integer(), name: f.text() }).primaryKey((r) => [r.a, r.b])
const orders = (target: string, shown: AnyField) =>
  resource('orders').table('orders').fields({ id: f.integer(), customer_id: f.relation(target), shown }).primaryKey((r) => r.id)
const runtimes = (target: string) => resource('runtimes').table('runtimes').fields({ id: f.integer(), app_id: f.relation(target), release: f.text() }).primaryKey((r) => r.id)
const apps = resource('apps').table('apps').fields({ id: f.integer(), release: f.text().lookup({ from: 'runtimes', via: 'app_id', field: 'release' }) }).primaryKey((r) => r.id)

const check = (...resources: Parameters<typeof buildRegistry>[0]) => () => checkLookups(buildRegistry(resources))

describe('checkLookups', () => {
  it("takes a lookup of the linked field's type, filtered as that field is", () => {
    expect(check(customers, orders('customers', f.text().lookup({ via: 'customer_id', field: 'name' }).filterable()))).not.toThrow()
    expect(check(customers, orders('customers', f.enum(['gold', 'silver']).lookup({ via: 'customer_id', field: 'tier' })))).not.toThrow()
    expect(check(apps, runtimes('apps'))).not.toThrow()
  })

  it('names a linked resource or field the app does not have', () => {
    expect(check(customers, orders('gone', f.text().lookup({ via: 'customer_id', field: 'name' })))).toThrow('orders lookup field "shown" goes through "customer_id" to "gone", which the app does not have')
    expect(check(customers, orders('customers', f.text().lookup({ via: 'customer_id', field: 'nope' })))).toThrow('shows "nope", which is not a field of customers')
    expect(check(pairs, orders('pairs', f.text().lookup({ via: 'customer_id', field: 'name' })))).toThrow('whose key has 2 fields, not one')
    expect(check(apps)).toThrow('apps lookup field "release" reads "runtimes", which the app does not have')
    expect(check(apps, runtimes('customers'), customers)).toThrow('reads "runtimes" through "app_id", which is not a relation of runtimes to apps')
  })

  it('refuses a linked field of another type, a sensitive one, and a filter or sort the linked field does not take', () => {
    expect(check(customers, orders('customers', f.integer().lookup({ via: 'customer_id', field: 'name' })))).toThrow('is integer, but customers.name is text')
    expect(check(customers, orders('customers', f.enum(['gold']).lookup({ via: 'customer_id', field: 'tier' })))).toThrow('has other enum values than customers.tier')
    expect(check(customers, orders('customers', f.text().lookup({ via: 'customer_id', field: 'secret' })))).toThrow('shows "secret", which is sensitive')
    expect(check(customers, orders('customers', f.text().lookup({ via: 'customer_id', field: 'name' }).sortable()))).toThrow('is sortable, but customers.name is not')
  })
})
