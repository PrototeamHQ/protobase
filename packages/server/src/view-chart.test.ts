import { describe, expect, it } from 'vitest'
import { f, resource, restrictModel, view, type ResourceModel } from '@protobase/schema'
import { checkViewQueries } from './check-view-queries'
import { checkViews } from './check-views'
import type { Registry } from './registry'
import { pruneView } from './view-access'

const orders = resource('orders')
  .table('orders')
  .fields({
    id: f.integer(),
    status: f.enum(['open', 'paid']).filterable(),
    channel: f.text(),
    total: f.decimal({ precision: 10, scale: 2 }),
    note: f.text(),
    card: f.text().sensitive(),
    created_at: f.timestamp().filterable(),
  })
  .primaryKey((r) => r.id)

const model = orders.toModel()
const registry = { entries: [{ name: 'orders', model }] } as unknown as Registry
const chartView = (build: Parameters<ReturnType<typeof view<typeof orders>>['chart']>[0]) => view<typeof orders>('orders').chart(build).toModel()

describe('a list chart per value', () => {
  it('takes a filterable field of values to group by and a number to add up', () => {
    const fits = chartView((r) => ({ groupBy: r.status, type: 'donut', sum: r.total }))
    expect(() => checkViews(registry, [fits])).not.toThrow()
    expect(() => checkViewQueries([model], [fits])).not.toThrow()
  })

  it('refuses a date or a sensitive field to group by, and a field to add up that is no number', () => {
    expect(() => checkViews(registry, [chartView((r) => ({ groupBy: r.created_at }))])).toThrow('View "orders": chart: groupBy: "created_at" is a timestamp field; chart a date with { field, range, granularity }, and group by a field of values')
    expect(() => checkViews(registry, [chartView((r) => ({ groupBy: r.status, average: r.note }))])).toThrow('View "orders": chart: "note" is text, and only a number can be added up')
    expect(() => checkViews(registry, [chartView((r) => ({ groupBy: r.card }))])).toThrow('View "orders": sensitive field "card" cannot be in the chart')
    expect(() => checkViews(registry, [chartView((r) => ({ groupBy: r.status, type: 'donut', average: r.total }))])).toThrow('View "orders": chart: a donut shares out a total, and averages add up to none: count or sum instead')
  })

  it('refuses a field to group by that is not filterable', () => {
    expect(() => checkViewQueries([model], [chartView((r) => ({ groupBy: r.channel }))])).toThrow('the chart uses "channel", which is not filterable, so the API refuses it: mark "channel" .filterable()')
  })

  it('leaves the chart out for a caller who cannot read a field it groups by or adds up', () => {
    const summed = chartView((r) => ({ groupBy: r.status, sum: r.total }))
    const restricted = (hidden: string[]): ResourceModel => {
      const readableFields = Object.keys(model.fields).filter((name) => !hidden.includes(name))
      return restrictModel(model, { readableFields, writableFields: { create: readableFields, update: readableFields } })
    }
    const chartFor = (hidden: string[]) => pruneView(summed, restricted(hidden), { orders: restricted(hidden) }).chart
    expect(chartFor([])).toEqual({ groupBy: 'status', type: 'bar', sum: 'total', limit: 10 })
    expect(chartFor(['total'])).toBeUndefined()
    expect(chartFor(['status'])).toBeUndefined()
  })
})
