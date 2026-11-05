import { f, resource } from '@protobase/schema'
import { describe, expect, it } from 'vitest'
import { readyProblems } from './ready-check'

const invoices = resource('invoices').table('invoices')
  .fields({ id: f.integer(), status: f.enum(['draft', 'sent', 'paid']).filterable(), notes: f.text(), due_at: f.timestamp().filterable() })
  .primaryKey((r) => r.id)
  .events((e) => e.crud())
  .toModel()
const notes = resource('notes').table('notes').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id).toModel()
const models = (name: string) => ({ invoices, notes })[name]

describe('readyProblems', () => {
  it('takes a when on indexed fields with a time term, and key fields the resource has', () => {
    expect(readyProblems(models, { resource: 'invoices', when: "status = 'sent' AND due_at <= now() - 3d", key: ['due_at'] })).toEqual([])
  })

  it('refuses an unknown resource, one that records no changes, and an unknown key field', () => {
    expect(readyProblems(models, { resource: 'orders' })).toEqual([{ field: 'resource', message: '"orders" is not a resource of this app' }])
    expect(readyProblems(models, { resource: 'notes' })).toEqual([{ field: 'resource', message: 'notes records no changes, so no write reaches a trigger: declare events on it' }])
    expect(readyProblems(models, { resource: 'invoices', key: ['sent_at'] })).toEqual([{ field: 'key', message: 'invoices has no field "sent_at"' }])
  })

  it('refuses now() inside an OR, a time term on a field that is no time, and a field not indexed for filtering, naming them', () => {
    expect(readyProblems(models, { resource: 'invoices', when: "status = 'sent' OR due_at <= now()" })[0]!.message).toMatch(/uses now\(\) other than as/)
    expect(readyProblems(models, { resource: 'invoices', when: 'status <= now()' })).toContainEqual({ field: 'when', message: 'status is not a timestamp or date field of invoices' })
    expect(readyProblems(models, { resource: 'invoices', when: "notes = 'x'" })).toEqual([{ field: 'when', message: expect.stringContaining('notes') }])
  })
})
