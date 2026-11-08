import { describe, expect, expectTypeOf, it } from 'vitest'
import { f } from '../fields'
import { resource } from '../resource'
import type { InferRecord } from '../resource-types'
import type { BucketsModel } from './buckets-model'
import { bucketsState } from './buckets-of'

const readings = resource('readings')
  .table('readings')
  .fields({
    id: f.bigint().readOnly(),
    org_id: f.integer().filterable(),
    device_id: f.relation('devices').filterable(),
    kind: f.enum(['power', 'heat']),
    taken_at: f.timestamp().filterable(),
    watts: f.integer(),
    cost: f.decimal({ precision: 10, scale: 2 }),
    note: f.text().optional(),
    secret: f.text().sensitive(),
    user_id: f.text(),
  })
  .primaryKey((r) => r.id)

const hourly = () => resource('readings_hourly').table('readings_hourly')

describe('.bucketsOf()', () => {
  it('derives the fields, the key and the tenant from the source', () => {
    const model = hourly()
      .bucketsOf(readings.tenant((r) => r.org_id), { time: (r) => r.taken_at, every: 'hour', by: (r) => [r.org_id, r.device_id], measures: { watts: ['sum', 'max'], cost: ['sum'] }, late: '2 hours' })
      .toModel()
    expect(Object.keys(model.fields)).toEqual(['id', 'bucket', 'org_id', 'device_id', 'events', 'watts_sum', 'watts_max', 'cost_sum'])
    expect(model.primaryKey).toEqual(['id'])
    expect(model.tenant).toBe('org_id')
    expect(Object.values(model.fields).every((field) => field.readOnly)).toBe(true)
    expect(model.fields.bucket).toMatchObject({ type: 'timestamp', filterable: true, sortable: true, nullable: false })
    expect(model.fields.device_id).toMatchObject({ type: 'relation', relation: { resource: 'devices', columns: ['device_id'] }, filterable: true })
    expect(model.fields.events).toMatchObject({ type: 'bigint', nullable: false, filterable: false })
    expect(model.fields.watts_sum).toMatchObject({ type: 'bigint', nullable: true })
    expect(model.fields.watts_max).toMatchObject({ type: 'integer', nullable: true })
    expect(model.fields.cost_sum).toMatchObject({ type: 'decimal', nullable: true })
    expect(model.buckets).toEqual({ from: 'readings', time: 'taken_at', every: 'hour', by: ['org_id', 'device_id'], measures: { watts: ['sum', 'max'], cost: ['sum'] }, late: '2 hours' })
  })

  it('types its records from the source', () => {
    const rollup = hourly().bucketsOf(readings, { time: (r) => r.taken_at, every: 'day', by: (r) => [r.kind], measures: { watts: ['max'] }, late: '1 day' })
    expectTypeOf<InferRecord<typeof rollup>>().toEqualTypeOf<{ id: string; bucket: string; events: string; kind: 'power' | 'heat'; watts_max: number | null }>()
  })

  it('keeps the owner when it groups by it', () => {
    const owned = readings.owner((r) => r.user_id)
    expect(hourly().bucketsOf(owned, { time: (r) => r.taken_at, every: 'hour', by: (r) => [r.user_id], late: '0 minutes' }).toModel().owner).toBe('user_id')
    expect(hourly().bucketsOf(owned, { time: (r) => r.taken_at, every: 'hour', by: (r) => [r.kind], late: '0 minutes' }).toModel().owner).toBeUndefined()
  })

  it('refuses a tenant-scoped source whose tenant it does not group by', () => {
    expect(() => hourly().bucketsOf(readings.tenant((r) => r.org_id), { time: (r) => r.taken_at, every: 'hour', by: (r) => [r.device_id], late: '2 hours' })).toThrow(
      'Resource "readings_hourly": the time rollup does not group by "org_id", the tenant field of "readings"',
    )
  })

  it('refuses what a bucket cannot hold', () => {
    const rollup = (spec: Partial<BucketsModel>) =>
      bucketsState('readings_hourly', { model: readings.toModel(), fields: readings.state.fields! }, { from: 'readings', time: 'taken_at', every: 'hour', by: [], measures: {}, late: '2 hours', ...spec })
    expect(() => rollup({ every: 'week' as BucketsModel['every'] })).toThrow('every "week" is not hour or day')
    expect(() => rollup({ time: 'org_id' })).toThrow('time "org_id" is integer, not a timestamp')
    expect(() => rollup({ by: ['note'] })).toThrow('groups by "note", which is optional')
    expect(() => rollup({ by: ['secret'] })).toThrow('groups by "secret", which is sensitive')
    expect(() => rollup({ by: ['id'] })).toThrow('groups by "id", a name the rollup keeps for its own field')
    expect(() => rollup({ by: ['kind', 'kind'] })).toThrow('groups by "kind" twice')
    expect(() => rollup({ measures: { note: ['sum'] } })).toThrow('measures "note", which is text, not an integer, bigint or decimal')
    expect(() => rollup({ measures: { watts: [] } })).toThrow('measures "watts" with nothing')
    expect(() => rollup({ measures: { watts: ['avg' as 'sum'] } })).toThrow('measures "watts" with "avg", not sum or max')
    expect(() => rollup({ measures: { watts: ['sum', 'sum'] } })).toThrow('measures "watts" with sum twice')
    expect(() => rollup({ late: 'soon' })).toThrow('late "soon" is not a number of minutes, hours or days')
  })

  it('refuses a source that is a rollup itself, or whose reads follow a parent', () => {
    const first = hourly().bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: () => [], late: '2 hours' })
    expect(() => resource('readings_daily').table('readings_daily').bucketsOf(first, { time: (r) => r.bucket, every: 'day', by: () => [], late: '1 day' })).toThrow('which is a time rollup itself')
    const child = readings.parent((r) => r.device_id, 'read')
    expect(() => hourly().bucketsOf(child, { time: (r) => r.taken_at, every: 'hour', by: (r) => [r.device_id], late: '2 hours' })).toThrow('whose reads keep to records whose parent the caller reads')
  })

  it('refuses options that write its rows', () => {
    const rollup = hourly().bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: (r) => [r.kind], late: '2 hours' })
    expect(() => rollup.author((r) => r.kind).toModel()).toThrow('a time rollup cannot have .author(), as only the database writes its rows')
  })
})
