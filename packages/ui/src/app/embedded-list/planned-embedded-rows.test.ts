import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { photosKey } from '../../live/row-photos'
import { plannedEmbeddedRows } from './planned-embedded-rows'

const people = resource('people').table('people').fields({ id: f.integer().readOnly(), name: f.text() }).primaryKey((r) => r.id).toModel()
const claims = resource('task_claims').table('task_claims').fields({ id: f.integer().readOnly(), owner_id: f.relation('people') }).primaryKey((r) => r.id).toModel()
const resources = { people, task_claims: claims }
const photo = { path: 'a.jpg' }

describe('plannedEmbeddedRows', () => {
  it('names and pictures one record’s rows from the read of all of them, with its own total', () => {
    const rows = { isPending: false, error: null, rows: [{ id: 13, owner_id: 6 }], labels: { owner_id: { 5: 'Ada', 6: 'Grace' } }, photos: { 11: [photo], 13: [photo] } }
    const total = { isPending: false, error: null, rows: [{ value: 2, count: 37 }] }
    const { data } = plannedEmbeddedRows(resources, claims, ['owner_id'], { rows, total } as never)
    expect(data).toEqual({ rows: [{ id: '13', owner_id: { id: 6, name: 'Grace' }, [photosKey]: [photo] }], total: 37, estimated: false })
  })

  it('counts a record without rows as 0, and waits while its total loads', () => {
    const rows = { isPending: false, error: null, rows: [] }
    expect(plannedEmbeddedRows(resources, claims, [], { rows, total: { ...rows } }).data?.total).toBe(0)
    expect(plannedEmbeddedRows(resources, claims, [], { rows, total: { ...rows, isPending: true } }).isPending).toBe(true)
  })
})
