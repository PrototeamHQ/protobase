import type { ChartGranularity, ChartModel, ChartRange, GroupChartModel } from './model'
import type { Ref } from './refs'

const defaultLimit = 10

/** Records per `granularity` over a date or timestamp `field`. */
export type PeriodChartInput = {
  /** The date or timestamp field the records are counted by. */
  field: Ref
  /** How far back it reaches. */
  range: ChartRange
  /** How long each bar is. */
  granularity: ChartGranularity
}

/** Records per value of `groupBy`, counted, or with `sum` or `average` that of a numeric field. */
export type GroupChartInput = {
  /** The field whose values make the groups, such as a status or a relation; not a date. */
  groupBy: Ref
  /** Bars, the default, or a donut. */
  type?: GroupChartModel['type']
  /** How many values it shows, the largest; default 10. */
  limit?: number
  /** A numeric field each group adds up, instead of counting its records. */
  sum?: Ref
  /** A numeric field each group averages, instead of counting its records. */
  average?: Ref
}

/** What `.chart(...)` takes: a chart over time or per value. */
export type ChartInput = PeriodChartInput | GroupChartInput

export const chartModel = (input: ChartInput): ChartModel => {
  if (!('groupBy' in input)) return { field: input.field.name, range: input.range, granularity: input.granularity }
  if (input.sum && input.average) throw new Error('A chart takes sum or average, not both')
  const limit = input.limit ?? defaultLimit
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`A chart's limit must be a positive whole number, not ${limit}`)
  return {
    groupBy: input.groupBy.name,
    type: input.type ?? 'bar',
    ...(input.sum && { sum: input.sum.name }),
    ...(input.average && { average: input.average.name }),
    limit,
  }
}

/** Whether a list's chart counts records per value of a field rather than over time. */
export const isGroupChart = (chart: ChartModel): chart is GroupChartModel => 'groupBy' in chart

/** The fields a list's chart reads: its date field, or the field it groups by and the one it adds up. */
export const chartFields = (chart: ChartModel) =>
  isGroupChart(chart) ? [chart.groupBy, ...(chart.sum ? [chart.sum] : []), ...(chart.average ? [chart.average] : [])] : [chart.field]
