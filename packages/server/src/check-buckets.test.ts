import { describe, expect, it } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { checkBuckets } from './check-buckets'
import { buildRegistry } from './registry'

const readings = resource('readings')
  .table('readings')
  .fields({ id: f.bigint().readOnly(), user_id: f.text(), kind: f.text(), taken_at: f.timestamp(), watts: f.integer() })
  .primaryKey((r) => r.id)
  .owner((r) => r.user_id)
const byKind = resource('readings_hourly').table('readings_hourly').bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: (r) => [r.kind], measures: { watts: ['sum'] }, late: '2 hours' })
const byUser = resource('readings_hourly').table('readings_hourly').bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: (r) => [r.user_id], late: '2 hours' })

const check = (rollup: typeof byKind | typeof byUser, roles: Record<string, unknown>) => () => checkBuckets(buildRegistry([readings, rollup]), roles)

describe('checkBuckets', () => {
  it('passes roles that read every record of the source, or rows the rollup groups by', () => {
    expect(check(byKind, defineRoles({ admin: ['*'], viewer: ['readings.read'], limited: [{ 'readings.read': { fields: ['kind'] } }] }).definitions)).not.toThrow()
    expect(check(byKind, defineRoles({ heat: [{ 'readings.read': { filter: 'kind = "heat"' } }] }).definitions)).not.toThrow()
    expect(check(byUser, defineRoles({ own: ['readings.read.own'] }).definitions)).not.toThrow()
  })

  it("refuses a role that reads only its own records while the rollup does not group by their owner", () => {
    expect(check(byKind, defineRoles({ own: ['readings.read.own'] }).definitions)).toThrow(
      'Resource "readings_hourly" is a time rollup of "readings", whose reads it cannot keep to: role "own" reads only its own or its team\'s readings with "readings.read.own", but the rollup does not group by their owner',
    )
    expect(check(byKind, defineRoles({ team: ['*.read.team'] }, { teamOf: () => [] }).definitions)).toThrow('role "team" reads only its own or its team\'s readings with "*.read.team"')
  })

  it('refuses a role whose filter reads fields the rollup does not group by', () => {
    expect(check(byKind, defineRoles({ low: [{ 'readings.read': { filter: 'watts < 100' } }] }).definitions)).toThrow('role "low" reads only the readings its filter keeps with "readings.read", which reads fields the rollup does not group by')
  })

  it('refuses a rollup of a resource the app does not have', () => {
    expect(() => checkBuckets(buildRegistry([byKind]), undefined)).toThrow('Resource "readings_hourly" is a time rollup of "readings", which is not a resource')
  })
})
