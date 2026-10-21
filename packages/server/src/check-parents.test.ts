import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { checkParents } from './check-parents'
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
