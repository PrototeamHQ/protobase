import { describe, expect, it } from 'vitest'
import type { FieldModel } from '@protobase/schema'
import { groupFilter, measureText, periodPoints, valueSlices } from './chart-groups'

const field = (name: string, type: FieldModel['type'], extra: Partial<FieldModel> = {}): FieldModel => ({ name, column: name, type, nullable: true, readOnly: false, filterable: true, sortable: true, aliases: [], ...extra })

const status = field('status', 'enum', { enumValues: ['open', 'won', 'lost'] })
const total = field('total', 'decimal')

describe('valueSlices', () => {
  it("names and colours an enum's values by the view, else by their place among the values", () => {
    const slices = valueSlices([{ value: 'lost', count: 4 }, { value: 'open', count: 2 }, { value: null, count: 1 }], status, { valueLabels: { lost: 'Lost deal' }, valueColors: { open: '#00ff00' } }, { kind: 'count' })
    expect(slices).toEqual([
      { key: 'lost', label: 'Lost deal', value: 4, count: 4, color: 'var(--chart-3)', filter: 'status = "lost"' },
      { key: 'open', label: 'open', value: 2, count: 2, color: '#00ff00', filter: 'status = "open"' },
      { key: 'null', label: 'Not set', value: 1, count: 1, color: 'var(--faint-foreground)', filter: 'isNull(status)' },
    ])
  })

  it('takes the sum or average, names a relation by its label and keeps the chart filter in each link', () => {
    const customer = field('customer', 'relation', { relation: { resource: 'customers', columns: ['customer_id'] } })
    const [first] = valueSlices([{ value: 12, label: 'Acme', count: 3, sum: 99.5 }], customer, undefined, { kind: 'sum', field: total }, 'total > 10')
    expect(first).toMatchObject({ label: 'Acme', value: 99.5, count: 3, color: 'var(--chart-1)', filter: '(total > 10) AND customer = 12' })
    expect(valueSlices([{ value: false, count: 1 }], field('paid', 'boolean'), undefined, { kind: 'count' })[0]).toMatchObject({ label: 'No', color: 'var(--chart-2)', filter: 'paid = false' })
  })
})

describe('periodPoints and measureText', () => {
  it('reads buckets as UTC and a missing measure as no value', () => {
    expect(periodPoints([{ value: '2026-01-01T00:00:00', count: 0, sum: null }], { kind: 'sum', field: total })).toEqual([{ at: Date.UTC(2026, 0, 1), value: null, count: 0 }])
  })

  it('writes counts whole and amounts with the field hints', () => {
    expect(measureText(1234, { kind: 'count' })).toBe('1,234')
    expect(measureText(1234.5, { kind: 'average', field: total, hints: { prefix: '€' } })).toBe('€1,234.50')
    expect(measureText(1234.5, { kind: 'sum', field: total, hints: { decimals: 0, suffix: ' m²' } })).toBe('1,235 m²')
    expect(measureText(null, { kind: 'count' })).toBe('—')
  })

  it('builds a filter for one value', () => {
    expect(groupFilter(status, 'won')).toBe('status = "won"')
  })
})
