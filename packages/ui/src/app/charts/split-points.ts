import type { Aggregate, AggregateGroup } from '@protobase/client'
import type { FieldModel, FieldViewModel } from '@protobase/schema'
import { colorOf, groupFilter, labelOf, periodPoints, type ChartMeasure } from './chart-groups'

/** One part of a split bucket as a chart draws it: the key of its number in a point, its name and colour, and its records. */
export type ChartSeries = { key: string; label: string; color: string; filter?: string }

export type SplitPoint = ReturnType<typeof periodPoints>[number] & Record<string, number | null>

// Sums of decimals carry float noise; what is left under this is no remainder
const noise = 1e-6

/**
 * A date field's buckets with each split into one part per value of another field, in the order the API ranks them.
 * A bucket where a value has no records holds 0 of a count and no value of a sum or average. For a count or a sum, what
 * the kept values leave of the bucket's total is "Other", a series of its own when some bucket has any; an average
 * has no remainder.
 */
export const splitPoints = (
  groups: AggregateGroup[],
  splits: NonNullable<Aggregate['splits']>,
  field: FieldModel,
  hints: FieldViewModel | undefined,
  measure: ChartMeasure,
  filter = '',
): { series: ChartSeries[]; points: SplitPoint[] } => {
  const series: ChartSeries[] = splits.map((split, index) => ({
    key: `s${index}`,
    label: labelOf(field, hints, split),
    color: colorOf(field, hints, split.value, index),
    filter: groupFilter(field, split.value, filter),
  }))
  const missing = measure.kind === 'count' ? 0 : null
  const partOf = (group: AggregateGroup, value: AggregateGroup['value']) => {
    const part = group.splits?.find((candidate) => candidate.value === value)
    if (!part) return missing
    return measure.kind === 'count' ? part.count : (part[measure.kind] ?? null)
  }
  const points = periodPoints(groups, measure).map((point, at): SplitPoint => {
    const group = groups[at]!
    const parts = splits.map((split) => partOf(group, split.value))
    const entries = Object.fromEntries(parts.map((part, index) => [`s${index}`, part]))
    if (measure.kind === 'average') return { ...point, ...entries }
    const rest = point.value === null ? null : point.value - parts.reduce<number>((all, part) => all + (part ?? 0), 0)
    return { ...point, ...entries, other: rest === null ? null : rest < noise ? 0 : rest }
  })
  const hasOther = measure.kind !== 'average' && points.some((point) => (point.other ?? 0) > 0)
  if (!hasOther) return { series, points: points.map(({ other, ...point }) => point as SplitPoint) }
  return { series: [...series, { key: 'other', label: 'Other', color: 'var(--border-strong)' }], points }
}
