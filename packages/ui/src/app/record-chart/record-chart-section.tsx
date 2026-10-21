import { useState } from 'react'
import { createWhere, printFilter, type RecordChartModel, type RecordChartRange } from '@protobase/schema'
import { useAggregates } from '../../data/use-aggregates'
import { viewerZone } from '../../format/zone'
import { humanize } from '../../live/naming'
import { Segmented } from '../../primitives/segmented'
import { Skeleton } from '../../primitives/skeleton'
import { Section } from '../../record-view'
import type { ChartMeasure } from '../charts/chart-groups'
import { PeriodChart } from '../charts/period-chart'
import type { ChartSeries } from '../charts/split-points'
import { useAdminMeta } from '../meta-gate'
import { chartPoints, rangeBuckets, type SampleMeasure } from './chart-points'
import { text } from './messages'

const where = createWhere()
const ranges: RecordChartRange[] = ['1h', '24h', '7d']
const rangeLabels = { '1h': 'hour', '24h': 'day', '7d': 'week' } as const

/**
 * Line graphs of the samples of `item.resource` that point at the record (`l.chart`), each series' average or maximum
 * per bucket over the last hour, day or week, which the person switches between. Each series is one `:aggregate`
 * read with their access; a bucket without a sample is a gap in its line.
 */
export const RecordChartSection = ({ item, recordKey }: { item: RecordChartModel; recordKey: string }) => {
  const { resources, views } = useAdminMeta()
  const [range, setRange] = useState<RecordChartRange>(item.range ?? '1h')
  const [measure, setMeasure] = useState<SampleMeasure>('average')
  const model = resources[item.resource]
  const view = views[item.resource]
  const granularity = rangeBuckets[range]
  const filter = printFilter(where.eq(item.field, recordKey))
  const requests = item.series.map((name) => ({ groupBy: item.at, filter, ...(measure === 'average' ? { average: name } : { maximum: name }), range, granularity, timeZone: viewerZone() }))
  const results = useAggregates(item.resource, requests, Boolean(model))
  if (!model) return null

  const measures = item.series.map((name): ChartMeasure => ({ kind: measure, field: model.fields[name]!, ...(view?.fields[name] && { hints: view.fields[name] }) }))
  const series: ChartSeries[] = item.series.map((name, index) => ({ key: `s${index}`, label: view?.fields[name]?.label ?? humanize(name), color: `var(--chart-${index + 1})`, measure: measures[index]! }))
  const points = results.every((result) => result.data) ? chartPoints(results.map((result) => result.data!.groups), series.map((part) => part.key), measure) : []
  const actions = (
    <div className="flex flex-wrap gap-2">
      <Segmented label={text('measure')} value={measure} onChange={setMeasure} options={[{ value: 'average', label: text('average') }, { value: 'maximum', label: text('maximum') }]} />
      <Segmented label={text('range')} value={range} onChange={setRange} options={ranges.map((value) => ({ value, label: text(rangeLabels[value]) }))} />
    </div>
  )
  const body = () => {
    if (results.some((result) => result.error)) return <p className="text-danger-text">{text('couldNotLoad')}</p>
    if (results.some((result) => result.isPending)) return <Skeleton className="h-40 w-full" />
    if (points.every((point) => point.count === 0)) return <p className="text-muted-foreground">{text('noSamples')}</p>
    // One series needs no legend: the section's title names it
    return <PeriodChart points={points} measure={measures[0]!} bucket={granularity} type="line" series={series} {...(series.length > 1 && { resource: item.resource, view })} />
  }
  return (
    <Section title={item.title} help={item.help} actions={actions}>
      {body()}
    </Section>
  )
}
