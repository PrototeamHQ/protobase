import { describe, expect, it, vi } from 'vitest'
import { defineRoles, f, resource, where, type AccessContext } from '@protobase/schema'
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

  describe("a source's own read or list rule", () => {
    type Rules = Parameters<typeof readings.access>[0]
    const ruled = (rules: Rules, by: 'kind' | 'user_id' = 'kind') => {
      const source = readings.access(rules)
      const rollup = resource('readings_hourly').table('readings_hourly').bucketsOf(source, { time: (r) => r.taken_at, every: 'hour', by: (r) => [r[by]], late: '2 hours' })
      return (roles?: Record<string, unknown>) => () => checkBuckets(buildRegistry([source, rollup]), roles)
    }
    const ownRows = (ctx: AccessContext) => where.eq('user_id', String(ctx.user?.id))
    const refusal = (rule: string) => `Resource "readings_hourly" is a time rollup of "readings", whose reads it cannot check: its own ${rule}, as a rollup cannot prove its counts respect a custom row rule. Leave the source's read and list to the roles, or roll up another resource`

    it('refuses a read rule that filters rows, whether or not the rollup groups by its field', () => {
      expect(ruled({ read: ownRows })()).toThrow(refusal('"read" access rule'))
      expect(ruled({ read: ownRows }, 'user_id')()).toThrow(refusal('"read" access rule'))
    })

    it('refuses a list rule alone, and names both when both are set', () => {
      expect(ruled({ list: ownRows })()).toThrow(refusal('"list" access rule'))
      expect(ruled({ read: ownRows, list: ownRows })()).toThrow(refusal('"read" and "list" access rules'))
    })

    it('refuses any rule, as it cannot see what one keeps', () => {
      async function namedAsync() {
        return true
      }
      const roles = defineRoles({ viewer: ['readings.read'] })
      for (const read of [namedAsync, () => true, roles.can('readings.read')]) expect(ruled({ read })(roles.definitions)).toThrow(refusal('"read" access rule'))
    })

    it('refuses the rule even where the roles alone would pass', () => {
      expect(ruled({ read: ownRows }, 'user_id')(defineRoles({ own: ['readings.read.own'] }).definitions)).toThrow(refusal('"read" access rule'))
    })

    it('never runs the rule, so the message holds nothing it would return', () => {
      const read = vi.fn(() => where.eq('user_id', 'secret-user'))
      expect(ruled({ read })()).toThrow(refusal('"read" access rule'))
      expect(read).not.toHaveBeenCalled()
    })

    it('passes rules on writes only, and a ruled resource no rollup reads', () => {
      const writes = { create: () => false, update: ownRows, delete: () => false }
      expect(ruled(writes)(defineRoles({ viewer: ['readings.read'] }).definitions)).not.toThrow()
      expect(() => checkBuckets(buildRegistry([readings.access({ read: ownRows })]), undefined)).not.toThrow()
    })
  })
})
