import { describe, expect, it } from 'vitest'
import { f } from '../fields'
import { resource } from '../resource'
import { resolveAccess } from './resolve'

const readings = resource('readings')
  .table('readings')
  .fields({ id: f.bigint().readOnly(), kind: f.text(), taken_at: f.timestamp() })
  .primaryKey((r) => r.id)

describe('a time rollup', () => {
  it('is read-only, whatever its rules allow', async () => {
    const rollup = resource('readings_hourly')
      .table('readings_hourly')
      .bucketsOf(readings, { time: (r) => r.taken_at, every: 'day', by: (r) => [r.kind], late: '1 day' })
      .access({ read: () => true, create: () => true, update: () => true, delete: () => true })
    const access = await resolveAccess(rollup, { user: { id: 1 } })
    expect(access.operations).toEqual({ read: true, list: true, create: false, update: false, delete: false })
    expect(access.writableFields).toEqual({ create: [], update: [] })
  })
})
