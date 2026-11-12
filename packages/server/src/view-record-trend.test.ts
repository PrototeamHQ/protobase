import { describe, expect, it } from 'vitest'
import { f, resource, type RecordTrendModel } from '@protobase/schema'
import { recordTrendErrors } from './view-record-trend'

const objectives = resource('objectives').table('objectives').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id).toModel()
const pairs = resource('pairs').table('pairs').fields({ a: f.integer(), b: f.integer() }).primaryKey((r) => [r.a, r.b]).toModel()
const tasks = resource('tasks')
  .table('tasks')
  .fields({
    id: f.integer(),
    objective_id: f.relation('objectives').filterable(),
    other_id: f.integer().filterable(),
    shipped_at: f.timestamp().filterable(),
    due: f.date().filterable(),
    logged_at: f.timestamp(),
    note: f.text().filterable(),
  })
  .primaryKey((r) => r.id)
  .toModel()
const models = { objectives, pairs, tasks }

const trend = (o: Partial<RecordTrendModel> = {}): RecordTrendModel => ({ kind: 'trend', title: 'Shipped', resource: 'tasks', field: 'objective_id', at: 'shipped_at', range: '90d', granularity: 'week', ...o })

describe('recordTrendErrors', () => {
  it('accepts the records that point at the record, counted over a filterable date or timestamp', () => {
    expect(recordTrendErrors(trend(), 'objectives', models)).toEqual([])
    expect(recordTrendErrors(trend({ at: 'due', range: '1y', granularity: 'month' }), 'objectives', models)).toEqual([])
  })

  it('refuses a match or a date it cannot read through the aggregate API', () => {
    expect(recordTrendErrors(trend({ resource: 'nope' }), 'objectives', models)).toEqual(['unknown resource "nope"'])
    expect(recordTrendErrors(trend(), 'pairs', models)).toEqual(['pairs has a composite key, so a trend cannot match its records'])
    expect(recordTrendErrors(trend({ field: 'other_id' }), 'objectives', models)).toEqual(['"other_id" on tasks is not a relation to objectives'])
    expect(recordTrendErrors(trend({ at: 'logged_at' }), 'objectives', models)).toEqual(['at: "logged_at" on tasks is not filterable'])
    expect(recordTrendErrors(trend({ at: 'note' }), 'objectives', models)).toEqual(['at: "note" on tasks is text, not a date or timestamp'])
    expect(recordTrendErrors(trend({ at: 'gone' }), 'objectives', models)).toEqual(['at: unknown field "gone" on tasks'])
  })

  it('refuses a range or a bar length a list chart does not take', () => {
    expect(recordTrendErrors(trend({ range: '1h' as never, granularity: 'year' as never }), 'objectives', models)).toEqual([
      'range must be one of 7d, 30d, 90d, 1y, all, not "1h"',
      'granularity must be one of hour, day, week, month, not "year"',
    ])
  })
})
