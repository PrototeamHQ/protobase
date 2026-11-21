import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { compiled } from '../../../test-support/compile-sql'
import { measureSql } from './measure'
import { countSql } from './rollup-measure'

const readings = resource('readings')
  .table('readings')
  .fields({ id: f.bigint(), kind: f.text().filterable(), taken_at: f.timestamp().filterable(), watts: f.integer(), peak: f.integer().optional() })
  .primaryKey((r) => r.id)
const hourly = resource('readings_hourly')
  .table('readings_hourly')
  .bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: (r) => [r.kind], measures: { watts: ['sum', 'max'], peak: ['sum'] }, late: '2 hours' })
  .toModel()

const text = (kind: 'sum' | 'average' | 'maximum', field: string) => compiled(measureSql(hourly, { kind, field })).sql

describe('a measure over a time rollup', () => {
  it('reads the stored columns, so it gives what the same measure over the records gives', () => {
    expect(text('sum', 'watts_sum')).toBe('sum("t"."watts_sum")')
    expect(text('average', 'watts_sum')).toBe('(sum("t"."watts_sum") / sum("t"."events"))')
    expect(text('maximum', 'watts_max')).toBe('max("t"."watts_max")')
    expect(text('sum', 'events')).toBe('sum("t"."events")')
  })

  it('counts the records its buckets hold, where a resource counts its rows', () => {
    expect(compiled(countSql(hourly)).sql).toBe('sum("t"."events")')
    expect(compiled(countSql(readings.toModel())).sql).toBe('count(*)')
  })

  it('refuses what the buckets cannot give', () => {
    expect(() => text('average', 'watts_max')).toThrow(`"watts_max" keeps each bucket's greatest value, so a time rollup gives only its maximum`)
    expect(() => text('sum', 'watts_max')).toThrow('gives only its maximum')
    expect(() => text('maximum', 'watts_sum')).toThrow('gives its sum or average, not a maximum')
    expect(() => text('average', 'events')).toThrow('gives only their sum, the count')
    expect(() => text('maximum', 'events')).toThrow('gives only their sum, the count')
    expect(() => text('sum', 'id')).toThrow('"id" is no measure of the time rollup "readings_hourly"')
    expect(() => text('average', 'peak_sum')).toThrow('"peak" is optional in "readings"')
    expect(text('sum', 'peak_sum')).toBe('sum("t"."peak_sum")')
  })

  it('reads a resource that is no rollup as before', () => {
    expect(compiled(measureSql(readings.toModel(), { kind: 'average', field: 'watts' })).sql).toBe('avg("t"."watts")')
  })
})
