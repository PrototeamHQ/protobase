import { f, resource } from '@protobase/schema'
import { describe, expect, it } from 'vitest'
import { readyProblems } from './ready-check'

const invoices = resource('invoices').table('invoices')
  .fields({ id: f.integer(), status: f.enum(['draft', 'sent', 'paid']).filterable(), title: f.text().filterable(), notes: f.text(), secret: f.text().sensitive(), due_at: f.timestamp().filterable().alias('deadline') })
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

  it('refuses a sensitive key field, which a record read never carries', () => {
    expect(readyProblems(models, { resource: 'invoices', key: ['secret'] })).toEqual([{ field: 'key', message: 'secret is sensitive, so a record read never carries it' }])
  })

  it('takes a time term on a field alias, and a literal that only reads like search(', () => {
    expect(readyProblems(models, { resource: 'invoices', when: 'deadline <= now() - 1d' })).toEqual([])
    expect(readyProblems(models, { resource: 'invoices', when: 'title = "search("' })).toEqual([])
  })

  it('refuses search() and similar()', () => {
    expect(readyProblems(models, { resource: 'invoices', when: 'search("late")' })).toContainEqual({ field: 'when', message: 'cannot use search() or similar()' })
  })
})
