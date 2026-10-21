import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { aadOf, bindingOf, movedBinding, pendingBinding } from './binding'

const people = (table: string) =>
  resource('people').table(table).fields({ id: f.bigint(), org: f.text(), iban: f.text().encrypted() }).primaryKey((r) => r.id).tenant((r) => r.org).toModel()
const lines = resource('lines').table('lines').fields({ order: f.text(), line: f.text(), note: f.text().encrypted() }).primaryKey((r) => [r.order, r.line]).toModel()

describe('bindingOf', () => {
  const model = people('people')
  const iban = model.fields.iban!

  it('binds the table as declared, the column, the tenant and the key as text', () => {
    expect(bindingOf(model, iban, { id: '9007199254740993', org: 'a' })).toEqual({ schema: null, table: 'people', column: 'iban', tenant: 'a', key: ['9007199254740993'] })
    expect(bindingOf(people('public.people'), iban, { id: '1', org: 'a' }).schema).toBe('public')
    expect(pendingBinding(model, iban)).toEqual({ schema: null, table: 'people', column: 'iban', tenant: null, key: null })
  })

  it('gives two tenants with the same record key different AADs', () => {
    expect(aadOf('k', bindingOf(model, iban, { id: '7', org: 'a' })).equals(aadOf('k', bindingOf(model, iban, { id: '7', org: 'b' })))).toBe(false)
  })

  it('keeps a composite key in its order', () => {
    const note = lines.fields.note!
    expect(bindingOf(lines, note, { order: 'a', line: 'b' }).key).toEqual(['a', 'b'])
    expect(aadOf('k', bindingOf(lines, note, { order: 'a', line: 'b' })).equals(aadOf('k', bindingOf(lines, note, { order: 'b', line: 'a' })))).toBe(false)
  })

  it('does not confuse names that hold a dot', () => {
    const a = { schema: 'a.b', table: 'c', column: 'x', tenant: null, key: ['1'] }
    const b = { schema: 'a', table: 'b.c', column: 'x', tenant: null, key: ['1'] }
    expect(aadOf('k', a).equals(aadOf('k', b))).toBe(false)
  })

  it('throws on a record without its key', () => {
    expect(() => bindingOf(model, iban, { org: 'a' })).toThrow('needs the record\'s "id"')
  })
})

describe('movedBinding', () => {
  const binding = { schema: null, table: 'people', column: 'bank_iban', tenant: 'a', key: ['1'] }

  it('replaces only what it names', () => {
    expect(movedBinding(binding, { column: 'iban' })).toEqual({ ...binding, column: 'iban' })
    expect(movedBinding(binding, { table: 'crm.persons' })).toEqual({ ...binding, schema: 'crm', table: 'persons' })
    expect(movedBinding({ ...binding, schema: 'crm' }, { table: 'persons' })).toEqual({ ...binding, schema: null, table: 'persons' })
  })
})
