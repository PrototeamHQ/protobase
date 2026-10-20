import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { rowRecord } from './row-record'

const vms = resource('vms')
  .table('vms')
  .fields({ id: f.integer(), status: f.enum(['running', 'stopped']), host_id: f.relation('hosts') })
  .primaryKey((r) => r.id)
  .toModel()

describe('rowRecord', () => {
  it("takes the row's fields, its relations by key, and its key, ETag and permissions", () => {
    const row = { id: '7', status: 'running', host_id: { id: 2, name: 'pve-1' }, etag: 'W/"1"', permissions: { update: true, delete: false }, disks: [] }
    expect(rowRecord(vms, row)).toEqual({ model: vms, record: { id: '7', status: 'running', host_id: 2 }, key: '7', etag: 'W/"1"', permissions: { update: true, delete: false } })
  })

  it('leaves out an ETag and permissions the row has not', () => {
    expect(rowRecord(vms, { id: '7', status: 'stopped' })).toEqual({ model: vms, record: { id: '7', status: 'stopped' }, key: '7' })
  })
})
