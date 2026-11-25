import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { settingsStoreNames } from '../../better-auth/store/offline/settings-names'
import { queryInput } from './query-input'

const over = (name: string, table: string) => resource(name).table(table).fields({ id: f.integer() }).primaryKey((r) => r.id).toModel()

describe('queryInput', () => {
  it("takes each resource's table by resource", () => {
    expect(queryInput([over('notes', 'notes'), over('orders', 'sales.orders')], undefined)).toEqual({
      names: {},
      resources: { grants: { notes: { table: { name: 'notes' }, input: { name: 'notes' } }, orders: { table: { schema: 'sales', name: 'orders' }, input: { schema: 'sales', name: 'orders' } } } },
    })
  })

  it('leaves out a table of the auth store, by its name with or without public, and of a guarded schema', () => {
    const store = settingsStoreNames({ schema: 'public', users: { guardedSchemas: ['auth'] } })
    const grants = queryInput([over('people', 'user'), over('sessions', 'public.session'), over('identities', 'auth.identities'), over('notes', 'notes')], store).resources.grants!
    expect(Object.keys(grants)).toEqual(['notes'])
  })

  it('takes a table two resources share once, under the first', () => {
    expect(Object.keys(queryInput([over('notes', 'notes'), over('open_notes', 'public.notes')], undefined).resources.grants!)).toEqual(['notes'])
  })
})
