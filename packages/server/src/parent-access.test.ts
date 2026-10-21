import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { parentTargets, pathKey } from './parent-access'

const transfers = resource('transfers').table('transfers')
  .fields({ id: f.integer(), target_vm_id: f.relation('vms'), source_vm_id: f.relation('vms').optional(), folder_id: f.relation('folders').optional() })
  .primaryKey((r) => r.id)
  .parent((r) => r.target_vm_id, 'update')
  .parent((r) => r.source_vm_id, 'read')
  .parent((r) => r.folder_id, 'update')
  .toModel()

const keys = (records: Record<string, unknown>[]) => parentTargets(transfers, records).map(({ key, access }) => [key, access])

describe('parentTargets', () => {
  it('names a record\'s parents with their needs, skipping null and missing relations', () => {
    expect(parentTargets(transfers, [{ id: 1, target_vm_id: 2, source_vm_id: null }]))
      .toEqual([{ field: 'target_vm_id', access: 'update', resource: 'vms', value: 2, key: pathKey('vms', [2]) }])
  })

  it('sorts the parents by path key, whatever their declaration order', () => {
    expect(keys([{ target_vm_id: 'a', source_vm_id: 'b', folder_id: 9 }])).toEqual([[pathKey('folders', [9]), 'update'], [pathKey('vms', ['a']), 'update'], [pathKey('vms', ['b']), 'read']])
    expect(keys([{ target_vm_id: 'b', source_vm_id: 'a' }])).toEqual([[pathKey('vms', ['a']), 'read'], [pathKey('vms', ['b']), 'update']])
  })

  it('merges an update\'s old and new record into one sorted list, a parent with the same need once', () => {
    expect(keys([{ target_vm_id: 'b' }, { target_vm_id: 'a' }])).toEqual([[pathKey('vms', ['a']), 'update'], [pathKey('vms', ['b']), 'update']])
    expect(keys([{ target_vm_id: 'a' }, { target_vm_id: 'a' }])).toEqual([[pathKey('vms', ['a']), 'update']])
    expect(keys([{ target_vm_id: 'a', source_vm_id: 'a' }])).toEqual([[pathKey('vms', ['a']), 'update'], [pathKey('vms', ['a']), 'read']])
  })

  it('treats a number and its text as the same record', () => {
    expect(pathKey('vms', [1])).toBe(pathKey('vms', ['1']))
  })
})
