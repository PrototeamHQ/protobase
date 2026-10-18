import { describe, expect, it } from 'vitest'
import { f, resource, type RelatedModel, type ResourceModel } from '@protobase/schema'
import { rentalResources } from './testing/rentals-domain'
import { relatedOpens, relationTarget } from './related-opens'

const tasks = resource('tasks').table('tasks').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id)
const versions = resource('versions').table('versions').fields({ task_id: f.relation('tasks'), number: f.integer() }).primaryKey((r) => [r.task_id, r.number])
const dependencies = resource('task_dependencies')
  .table('task_dependencies')
  .fields({ task_id: f.relation('tasks').filterable(), type: f.text(), depends_on_id: f.relation('tasks').filterable(), reason: f.text() })
  .primaryKey((r) => [r.task_id, r.type, r.depends_on_id])
const links = resource('links')
  .table('links')
  .fields({ id: f.integer(), task_id: f.relation('tasks').filterable(), other_id: f.relation('tasks'), version_id: f.relation('versions'), note: f.text() })
  .primaryKey((r) => r.id)
const triples = resource('triples')
  .table('triples')
  .fields({ a_id: f.relation('tasks').filterable(), b_id: f.relation('tasks'), c_id: f.relation('tasks') })
  .primaryKey((r) => [r.a_id, r.b_id, r.c_id])
const tenanted = resource('org_dependencies')
  .table('org_dependencies')
  .fields({ org_id: f.relation('orgs'), task_id: f.relation('tasks').filterable(), depends_on_id: f.relation('tasks') })
  .primaryKey((r) => [r.org_id, r.task_id, r.depends_on_id])
  .tenant((r) => r.org_id)
const orgs = resource('orgs').table('orgs').fields({ id: f.integer() }).primaryKey((r) => r.id)
const pinned = resource('version_pins')
  .table('version_pins')
  .fields({ task_id: f.relation('tasks').filterable(), version_id: f.relation('versions') })
  .primaryKey((r) => [r.task_id, r.version_id])

const resources: Record<string, ResourceModel> = Object.fromEntries(
  [tasks, versions, dependencies, links, triples, tenanted, orgs, pinned].map((entry) => [entry.toModel().name, entry.toModel()]),
)
const section = (resource: string, field: string, o: Partial<RelatedModel> = {}): RelatedModel => ({ kind: 'related', title: 'Related', resource, field, ...o })
const opens = (item: RelatedModel, from = resources) => relatedOpens(item, from[item.resource]!, from)

describe('relatedOpens', () => {
  it('opens the other side of a link keyed on its relations, from either side', () => {
    expect(opens(section('task_dependencies', 'task_id'))).toBe('depends_on_id')
    expect(opens(section('task_dependencies', 'depends_on_id'))).toBe('task_id')
  })

  it('leaves rows that are records in their own right, or link more than two records, to open themselves', () => {
    expect(opens(section('links', 'task_id'))).toBeUndefined()
    expect(opens(section('triples', 'a_id'))).toBeUndefined()
  })

  it('takes an explicit open whose records can be opened, and none that cannot', () => {
    expect(opens(section('links', 'task_id', { open: 'other_id' }))).toBe('other_id')
    expect(opens(section('links', 'task_id', { open: 'note' }))).toBeUndefined()
    expect(opens(section('links', 'task_id', { open: 'task_id' }))).toBeUndefined()
    expect(opens(section('links', 'task_id', { open: 'version_id' }))).toBeUndefined()
    const { tasks: _, ...withoutTasks } = resources
    expect(opens(section('links', 'task_id', { open: 'other_id' }), withoutTasks)).toBeUndefined()
  })

  it('ignores the tenant field and relations to records with a composite key', () => {
    expect(opens(section('org_dependencies', 'task_id'))).toBe('depends_on_id')
    expect(opens(section('version_pins', 'task_id'))).toBeUndefined()
  })

  it("opens a unit's tenants from the lease links it lists, and a tenant's leases as they are", () => {
    const rentals = Object.fromEntries(rentalResources.map((model) => [model.name, model]))
    expect(opens(section('lease_tenants', 'lease_id', { through: { resource: 'leases', field: 'unit_id' } }), rentals)).toBe('tenant_id')
    expect(opens(section('leases', 'id', { through: { resource: 'lease_tenants', field: 'tenant_id', key: 'lease_id' } }), rentals)).toBeUndefined()
  })
})

describe('relationTarget', () => {
  it("reads the key of the record a relation points at, shown or not", () => {
    expect(relationTarget({ other_id: { id: 7, name: 'x' } }, 'other_id')).toBe(7)
    expect(relationTarget({ other_id: 'abc' }, 'other_id')).toBe('abc')
    expect(relationTarget({ other_id: null }, 'other_id')).toBeUndefined()
    expect(relationTarget({}, 'other_id')).toBeUndefined()
  })
})
