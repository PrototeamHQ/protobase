import { describe, expect, it } from 'vitest'
import { rebindOption } from './rebind-option'

describe('rebindOption', () => {
  it('takes a resource with a former table, or a field with a former column', () => {
    expect(rebindOption({})).toBeUndefined()
    expect(rebindOption({ rebind: 'people', fromTable: 'crm.persons' })).toEqual({ resource: 'people', from: { table: 'crm.persons' } })
    expect(rebindOption({ rebind: 'people.iban', fromColumn: 'iban' })).toEqual({ resource: 'people', field: 'iban', from: { column: 'iban' } })
    expect(rebindOption({ rebind: 'people.iban', fromTable: 'persons', fromColumn: 'iban' })).toEqual({ resource: 'people', field: 'iban', from: { table: 'persons', column: 'iban' } })
  })

  it('refuses what cannot be rebound', () => {
    expect(() => rebindOption({ fromTable: 'persons' })).toThrow('go with --rebind')
    expect(() => rebindOption({ fromColumn: 'iban' })).toThrow('go with --rebind')
    expect(() => rebindOption({ rebind: 'people' })).toThrow('--rebind needs --from-table')
    expect(() => rebindOption({ rebind: 'people', fromColumn: 'iban' })).toThrow('--from-column needs the field')
    expect(() => rebindOption({ rebind: 'people.', fromTable: 'x' })).toThrow('--rebind takes')
    expect(() => rebindOption({ rebind: 'a.b.c', fromTable: 'x' })).toThrow('--rebind takes')
  })
})
