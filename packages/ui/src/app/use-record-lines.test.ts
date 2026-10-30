import { describe, expect, it } from 'vitest'
import { f, l, resource, view } from '@protobase/schema'
import { findLinesResource, lineColumnNames } from './use-record-lines'

const invoices = resource('invoices').table('invoices').fields({ id: f.integer(), number: f.text() }).primaryKey((r) => r.id)
const invoiceLines = resource('invoice_lines')
  .table('invoice_lines')
  .fields({ id: f.integer(), invoice_id: f.relation('invoices').filterable(), position: f.integer().sortable(), description: f.text(), quantity: f.integer() })
  .primaryKey((r) => r.id)
  .position((r) => r.position, { within: (r) => r.invoice_id })
const steps = resource('steps')
  .table('steps')
  .fields({ id: f.integer(), invoice_id: f.relation('invoices').filterable(), rank: f.integer().sortable(), title: f.text() })
  .primaryKey((r) => r.id)
  .position((r) => r.rank, { within: (r) => r.invoice_id })

const resources = Object.fromEntries([invoices, invoiceLines, steps].map((each) => each.toModel()).map((model) => [model.name, model]))

describe('findLinesResource', () => {
  it('finds no lines without a declaration, even with position and quantity fields', () => {
    expect(findLinesResource(resources, undefined)).toBeUndefined()
    const listed = view<typeof invoices>('invoices').layout(() => [l.related('Lines', { resource: 'invoice_lines', field: 'invoice_id' })]).toModel()
    expect(findLinesResource(resources, listed)).toBeUndefined()
  })

  it('finds the declared lines, without a quantity field, ordered by their own position field', () => {
    const declared = view<typeof invoices>('invoices').layout(() => [l.group('More', [l.related('Steps', { resource: 'steps', field: 'invoice_id', lines: true })])]).toModel()
    const found = findLinesResource(resources, declared)
    expect(found && { title: found.item.title, model: found.model.name, link: found.link.name, position: found.position }).toEqual({ title: 'Steps', model: 'steps', link: 'invoice_id', position: 'rank' })
  })

  it('finds no lines the user cannot see, which the meta does not hold', () => {
    const declared = view<typeof invoices>('invoices').layout(() => [l.related('Steps', { resource: 'steps', field: 'invoice_id', lines: true })]).toModel()
    const { steps: _, ...visible } = resources
    expect(findLinesResource(visible, declared)).toBeUndefined()
  })
})

describe('lineColumnNames', () => {
  it('leaves out the key, the relation to the record and the field that orders the lines', () => {
    expect(lineColumnNames(resources.steps!, undefined, 'invoice_id', 'rank')).toEqual(['title'])
  })
})
