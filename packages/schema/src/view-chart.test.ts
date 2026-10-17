import { describe, expect, it } from 'vitest'
import { f } from './fields'
import { resource } from './resource'
import { view } from './view'
import { chartFields } from './view-chart'

const orders = resource('orders')
  .table('orders')
  .fields({ id: f.integer(), status: f.enum(['open', 'paid']), total: f.decimal({ precision: 10, scale: 2 }), created_at: f.timestamp() })
  .primaryKey((r) => r.id)

const chartOf = (build: Parameters<ReturnType<typeof view<typeof orders>>['chart']>[0]) => view<typeof orders>('orders').chart(build).toModel().chart

describe('list charts', () => {
  it('keeps a chart over time as it was', () => {
    expect(chartOf((r) => ({ field: r.created_at, range: '30d', granularity: 'day' }))).toEqual({ field: 'created_at', range: '30d', granularity: 'day' })
  })

  it('groups by a field as bars of the ten largest unless told otherwise', () => {
    const counted = chartOf((r) => ({ groupBy: r.status }))
    expect(counted).toEqual({ groupBy: 'status', type: 'bar', limit: 10 })
    const summed = chartOf((r) => ({ groupBy: r.status, type: 'donut', sum: r.total, limit: 5 }))
    expect(summed).toEqual({ groupBy: 'status', type: 'donut', sum: 'total', limit: 5 })
    expect(chartFields(summed!)).toEqual(['status', 'total'])
  })

  it('refuses a sum and an average together, and a limit that is not a positive whole number', () => {
    expect(() => chartOf((r) => ({ groupBy: r.status, sum: r.total, average: r.total }))).toThrow('A chart takes sum or average, not both')
    expect(() => chartOf((r) => ({ groupBy: r.status, limit: 0 }))).toThrow("A chart's limit must be a positive whole number, not 0")
  })
})
