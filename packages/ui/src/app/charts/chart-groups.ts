import type { AggregateGroup } from '@protobase/client'
import { createWhere, enumLabel, printFilter, type FieldModel, type FieldViewModel } from '@protobase/schema'

const where = createWhere()

/** How many fixed colours a chart has, `--chart-1` to `--chart-8`; more values than that share a neutral one. */
export const seriesColors = 8

/** What a chart adds up per group: how many records, or the sum or average of a numeric field. */
export type ChartMeasure = { kind: 'count' } | { kind: 'sum' | 'average'; field: FieldModel; hints?: FieldViewModel }

/** One group as a chart draws it: its name, its number, its colour, and the filter that lists its records. */
export type ChartSlice = { key: string; label: string; value: number | null; count: number; color: string; filter: string }

const slot = (index: number) => (index >= 0 && index < seriesColors ? `var(--chart-${index + 1})` : 'var(--faint-foreground)')

// A colour follows its value, never its rank: an enum's by its place among the values, a boolean's by true and false.
// Other values have no fixed order, so they take the colours in the order the groups come.
export const colorOf = (field: FieldModel, hints: FieldViewModel | undefined, value: AggregateGroup['value'], index: number) => {
  const key = String(value)
  if (value === null) return 'var(--faint-foreground)'
  if (hints?.valueColors && Object.hasOwn(hints.valueColors, key)) return hints.valueColors[key]!
  if (field.type === 'enum') return slot(field.enumValues?.indexOf(key) ?? -1)
  if (field.type === 'boolean') return slot(value ? 0 : 1)
  return slot(index)
}

export const labelOf = (field: FieldModel, hints: FieldViewModel | undefined, group: Pick<AggregateGroup, 'value' | 'label'>) => {
  if (group.value === null) return 'Not set'
  if (field.type === 'enum') return enumLabel(String(group.value), hints?.valueLabels)
  if (field.type === 'boolean') return group.value ? 'Yes' : 'No'
  return group.label ?? String(group.value)
}

/** The records of one group: the chart's own filter and the group's value. */
export const groupFilter = (field: FieldModel, value: AggregateGroup['value'], filter = '') => {
  const own = printFilter(value === null ? where.isNull(field.name) : where.eq(field.name, value as never))
  return filter.trim() ? `(${filter}) AND ${own}` : own
}

const measured = (group: AggregateGroup, measure: ChartMeasure) => (measure.kind === 'count' ? group.count : (group[measure.kind] ?? null))

/** The groups of a field of values as slices, in the order the API ranks them. */
export const valueSlices = (groups: AggregateGroup[], field: FieldModel, hints: FieldViewModel | undefined, measure: ChartMeasure, filter = ''): ChartSlice[] =>
  groups.map((group, index) => ({
    key: String(group.value),
    label: labelOf(field, hints, group),
    value: measured(group, measure),
    count: group.count,
    color: colorOf(field, hints, group.value, index),
    filter: groupFilter(field, group.value, filter),
  }))

/** A date field's buckets as points in time, the bucket's start read as UTC as the list's chart reads it. */
export const periodPoints = (groups: AggregateGroup[], measure: ChartMeasure) =>
  groups.map((group) => ({ at: Date.parse(`${String(group.value)}Z`), value: measured(group, measure), count: group.count }))

/** A measured number as text: a count whole, a sum or average with the field's decimals, prefix and suffix. */
export const measureText = (value: number | null, measure: ChartMeasure) => {
  if (value === null) return '—'
  if (measure.kind === 'count') return value.toLocaleString('en-IE')
  const decimals = measure.hints?.decimals ?? (Number.isInteger(value) ? 0 : 2)
  const text = value.toLocaleString('en-IE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return `${measure.hints?.prefix ?? ''}${text}${measure.hints?.suffix ?? ''}`
}
