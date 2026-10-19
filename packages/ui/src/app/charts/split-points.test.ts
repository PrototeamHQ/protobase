import { describe, expect, it } from 'vitest'
import type { FieldModel } from '@protobase/schema'
import { splitPoints } from './split-points'

const field = (name: string, type: FieldModel['type'], extra: Partial<FieldModel> = {}): FieldModel => ({ name, column: name, type, nullable: true, readOnly: false, filterable: true, sortable: true, aliases: [], ...extra })

const status = field('status', 'enum', { enumValues: ['open', 'won', 'lost'] })
const total = field('total', 'decimal')
const sum = { kind: 'sum', field: total } as const

const groups = [
  { value: '2026-01-01T00:00:00', count: 5, sum: 100, splits: [{ value: 'won', count: 3, sum: 70 }, { value: 'open', count: 1, sum: 20 }] },
  { value: '2026-01-02T00:00:00', count: 0, sum: null, splits: [] },
]
const splits = [{ value: 'won' }, { value: 'open' }, { value: null }]

describe('splitPoints', () => {
  it('names and colours the series by the value, in the order given', () => {
    const { series } = splitPoints(groups, splits, status, { valueLabels: { won: 'Won deal' } }, sum, 'total > 1')
    expect(series.slice(0, 3)).toEqual([
      { key: 's0', label: 'Won deal', color: 'var(--chart-2)', filter: '(total > 1) AND status = "won"' },
      { key: 's1', label: 'open', color: 'var(--chart-1)', filter: '(total > 1) AND status = "open"' },
      { key: 's2', label: 'Not set', color: 'var(--faint-foreground)', filter: '(total > 1) AND isNull(status)' },
    ])
  })

  it('leaves a missing part as no value for a sum and as 0 for a count', () => {
    const summed = splitPoints(groups, splits, status, undefined, sum).points
    expect(summed[0]).toMatchObject({ s0: 70, s1: 20, s2: null })
    expect(summed[1]).toMatchObject({ s0: null, s1: null, s2: null })
    const counted = splitPoints(groups, splits, status, undefined, { kind: 'count' }).points
    expect(counted[0]).toMatchObject({ s0: 3, s1: 1, s2: 0 })
  })

  it('shows what the kept values leave as Other, only when something is left', () => {
    const { series, points } = splitPoints(groups, splits, status, undefined, sum)
    expect(series.at(-1)).toEqual({ key: 'other', label: 'Other', color: 'var(--border-strong)' })
    expect(points.map((point) => point.other)).toEqual([10, null])
    const whole = [{ value: '2026-01-01T00:00:00', count: 4, sum: 90, splits: groups[0]!.splits }]
    const complete = splitPoints(whole, splits, status, undefined, sum)
    expect(complete.series.map((part) => part.key)).toEqual(['s0', 's1', 's2'])
    expect(complete.points[0]).not.toHaveProperty('other')
  })

  it('has no Other for an average', () => {
    const averaged = [{ value: '2026-01-01T00:00:00', count: 5, average: 10, splits: [{ value: 'won', count: 3, average: 8 }] }]
    const { series, points } = splitPoints(averaged, [{ value: 'won' }], status, undefined, { kind: 'average', field: total })
    expect(series.map((part) => part.key)).toEqual(['s0'])
    expect(points[0]).toMatchObject({ value: 10, s0: 8 })
    expect(points[0]).not.toHaveProperty('other')
  })
})
