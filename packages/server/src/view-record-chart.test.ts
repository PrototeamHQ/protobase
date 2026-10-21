import { describe, expect, it } from 'vitest'
import { f, resource, type RecordChartModel } from '@protobase/schema'
import { recordChartErrors } from './view-record-chart'

const hosts = resource('hosts').table('hosts').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id).toModel()
const samples = resource('host_samples')
  .table('host_samples')
  .fields({
    id: f.integer(),
    host_id: f.relation('hosts').filterable(),
    other_id: f.integer().filterable(),
    sampled_at: f.timestamp().filterable(),
    logged_at: f.timestamp(),
    day: f.date().filterable(),
    cpu: f.decimal({ precision: 5, scale: 2 }),
    memory: f.bigint(),
    note: f.text(),
    secret: f.integer().sensitive(),
  })
  .primaryKey((r) => r.id)
  .toModel()
const models = { hosts, host_samples: samples }

const chart = (o: Partial<RecordChartModel> = {}): RecordChartModel => ({ kind: 'chart', title: 'Usage', resource: 'host_samples', field: 'host_id', at: 'sampled_at', series: ['cpu', 'memory'], ...o })

describe('recordChartErrors', () => {
  it('accepts numeric series of the records that point at the record, over a filterable timestamp', () => {
    expect(recordChartErrors(chart(), 'hosts', models)).toEqual([])
    expect(recordChartErrors(chart({ range: '7d' }), 'hosts', models)).toEqual([])
  })

  it('refuses a match, a time or a series it cannot read through the aggregate API', () => {
    expect(recordChartErrors(chart({ resource: 'nope' }), 'hosts', models)).toEqual(['unknown resource "nope"'])
    expect(recordChartErrors(chart({ field: 'other_id' }), 'hosts', models)).toEqual(['"other_id" on host_samples is not a relation to hosts'])
    expect(recordChartErrors(chart({ at: 'logged_at' }), 'hosts', models)).toEqual(['at: "logged_at" on host_samples is not filterable'])
    expect(recordChartErrors(chart({ at: 'day' }), 'hosts', models)).toEqual(['at: "day" on host_samples is date, not a timestamp'])
    expect(recordChartErrors(chart({ series: ['note', 'secret', 'gone'] }), 'hosts', models)).toEqual([
      'series: "note" on host_samples is text, not a number',
      'series: "secret" on host_samples is sensitive',
      'series: unknown field "gone" on host_samples',
    ])
    expect(recordChartErrors(chart({ series: [] }), 'hosts', models)).toEqual(['series: name at least one field'])
    expect(recordChartErrors(chart({ range: '30d' as never }), 'hosts', models)).toEqual(['range must be one of 1h, 24h, 7d, not "30d"'])
  })
})
