import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { checkParents, parentWarnings } from './check-parents'
import { buildRegistry } from './registry'

const vms = resource('vms').table('vms').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id)
const pairs = resource('pairs').table('pairs').fields({ a: f.integer(), b: f.integer() }).primaryKey((r) => [r.a, r.b])
const operations = (target: string) =>
  resource('operations').table('operations').fields({ id: f.integer(), vm_id: f.relation(target) }).primaryKey((r) => r.id).parent((r) => r.vm_id, 'update')

describe('checkParents', () => {
  it('takes a relation to a resource with a key of one field', () => {
    expect(() => checkParents(buildRegistry([vms, operations('vms')]))).not.toThrow()
  })

  it('names a resource the app does not have, and one with a key of two fields', () => {
    expect(() => checkParents(buildRegistry([vms, operations('gone')]))).toThrow('operations parent "vm_id": unknown resource "gone"')
    expect(() => checkParents(buildRegistry([pairs, operations('pairs')]))).toThrow('operations parent "vm_id": "pairs" has a key of 2 fields, not one')
  })
})

describe('parentWarnings', () => {
  const apps = (access: 'read' | 'update') =>
    resource('apps').table('apps').fields({ id: f.integer(), org_id: f.integer(), vm_id: f.relation('vms') }).primaryKey((r) => r.id)
      .tenant((r) => r.org_id, { across: 'memberships' }).parent((r) => r.vm_id, access)

  it('names a resource listed across tenants that keeps to the parents its readers read', () => {
    expect(parentWarnings(buildRegistry([vms, apps('read')]))).toEqual([`"apps" keeps to the parents its readers read (.parent(..., 'read')), so its lists read the caller's own tenant only: tenantAcross is ignored`])
    expect(parentWarnings(buildRegistry([vms, apps('update'), operations('vms')]))).toEqual([])
  })
})
