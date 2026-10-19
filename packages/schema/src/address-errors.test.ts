import { describe, expect, it } from 'vitest'
import { addressErrors } from './address-errors'
import { f } from './fields'
import { resource } from './resource'

const customers = resource('customers').table('customers').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id).toModel()
const repairs = resource('repairs')
  .table('repairs')
  .fields({ id: f.integer().sortable(), customerId: f.relation('customers').filterable(), status: f.enum(['booked', 'ready']).filterable(), bike: f.text().filterable() })
  .primaryKey((r) => r.id)
  .toModel()
const models = { customers, repairs }

describe('addressErrors', () => {
  it('accepts an address whose names exist, placeholders taken from the record it sits on', () => {
    expect(addressErrors({ kind: 'list', resource: 'repairs', filter: 'customerId = {id} AND bike = "{name}"', orderBy: 'id desc' }, { models, source: customers })).toEqual([])
    expect(addressErrors({ kind: 'record', resource: 'customers', key: '{customerId}' }, { models, source: repairs })).toEqual([])
    expect(addressErrors({ kind: 'page', page: 'overview' }, { models, pages: new Set(['overview']) })).toEqual([])
  })

  it('names an unknown resource or page', () => {
    expect(addressErrors({ kind: 'create', resource: 'bikes' }, { models })).toEqual(['unknown resource "bikes"'])
    expect(addressErrors({ kind: 'page', page: 'nope' }, { models, pages: new Set() })).toEqual(['unknown page "nope"'])
    expect(addressErrors({ kind: 'nope' } as never, { models })).toEqual(['an address\'s kind is list, record, create or page, not "nope"'])
  })

  it('names placeholders the record does not have, or that have no record', () => {
    expect(addressErrors({ kind: 'record', resource: 'customers', key: '{ownerId}' }, { models, source: repairs })).toEqual(['"{ownerId}" is not a field of repairs'])
    expect(addressErrors({ kind: 'record', resource: 'customers', key: '{customerId}' }, { models })).toEqual(['"{customerId}" takes a value from the record, but the link sits on none'])
  })

  it('accepts create values for fields of the resource, from the record, and names the others', () => {
    expect(addressErrors({ kind: 'create', resource: 'repairs', values: { customerId: '{id}', status: 'booked' } }, { models, source: customers })).toEqual([])
    expect(addressErrors({ kind: 'create', resource: 'repairs', values: { colour: 'red', customerId: '{ownerId}' } }, { models, source: customers })).toEqual([
      '"{ownerId}" is not a field of customers',
      'values: unknown field "colour" on repairs',
    ])
  })

  it('accepts create values of any name for a resource with a create page, still checking placeholders', () => {
    const createPages = new Set(['repairs'])
    expect(addressErrors({ kind: 'create', resource: 'repairs', values: { colour: 'red', customerId: '{id}' } }, { models, source: customers, createPages })).toEqual([])
    expect(addressErrors({ kind: 'create', resource: 'repairs', values: { colour: '{ownerId}' } }, { models, source: customers, createPages })).toEqual(['"{ownerId}" is not a field of customers'])
    expect(addressErrors({ kind: 'create', resource: 'customers', values: { colour: 'red' } }, { models, createPages })).toEqual(['values: unknown field "colour" on customers'])
  })

  it('names fields the filter or order does not find, whatever the placeholders hold', () => {
    expect(addressErrors({ kind: 'list', resource: 'repairs', filter: 'owner = {id}' }, { models, source: customers })).toEqual([expect.stringContaining('filter:')])
    expect(addressErrors({ kind: 'list', resource: 'repairs', orderBy: 'colour asc' }, { models })).toEqual([expect.stringContaining('orderBy:')])
    expect(addressErrors({ kind: 'list', resource: 'repairs', filter: 'status = ' }, { models })).toEqual([expect.stringContaining('filter:')])
  })
})
