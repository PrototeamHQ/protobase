import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { seriesBuckets } from './series-buckets'

const readings = resource('readings')
  .table('readings')
  .fields({ id: f.bigint(), kind: f.text().filterable(), taken_at: f.timestamp().filterable() })
  .primaryKey((r) => r.id)
const rollup = (every: 'hour' | 'day') =>
  resource(`readings_${every}`).table(`readings_${every}`).bucketsOf(readings, { time: (r) => r.taken_at, every, by: (r) => [r.kind], late: '2 hours' }).toModel()
const range = { from: '2026-07-01T00:00:00Z', to: '2026-07-08T00:00:00Z' }
const buckets = (every: 'hour' | 'day', granularity: Parameters<typeof seriesBuckets>[2]['granularity'], timeZone?: string) =>
  () => seriesBuckets(rollup(every), 'bucket', { range, granularity, ...(timeZone && { timeZone }) })

describe('a series of a time rollup', () => {
  it('refuses a granularity finer than its buckets', () => {
    expect(buckets('hour', '15_minutes')).toThrow('"readings_hour" keeps hours, so it has no granularity finer than hour')
    expect(buckets('hour', 'minute')).toThrow('finer than hour')
    expect(buckets('hour', 'hour')).not.toThrow()
    expect(buckets('day', 'hour')).toThrow('"readings_day" keeps days, so it has no granularity finer than day')
    expect(buckets('day', 'week')).not.toThrow()
  })

  it('refuses another time zone than UTC for a daily rollup', () => {
    expect(buckets('day', 'day', 'Europe/Amsterdam')).toThrow('"readings_day" keeps days in UTC, so its series take only the time zone UTC')
    expect(buckets('day', 'month', 'UTC')).not.toThrow()
    expect(buckets('hour', 'day', 'Europe/Amsterdam')).not.toThrow()
  })

  it('leaves the series of a resource that is no rollup alone', () => {
    expect(() => seriesBuckets(readings.toModel(), 'taken_at', { range, granularity: '15_minutes', timeZone: 'Asia/Kolkata' })).not.toThrow()
  })
})
