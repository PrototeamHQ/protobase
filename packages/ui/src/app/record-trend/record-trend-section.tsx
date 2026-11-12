import { createWhere, printFilter, type RecordTrendModel } from '@protobase/schema'
import { useAggregate } from '../../data/use-aggregates'
import { viewerZone } from '../../format/zone'
import { Skeleton } from '../../primitives/skeleton'
import { Section } from '../../record-view'
import { periodPoints } from '../charts/chart-groups'
import { PeriodChart } from '../charts/period-chart'
import { ErrorBanner } from '../error-banner'
import { trendSummary } from './trend-summary'
import { text } from './messages'

const where = createWhere()
const count = { kind: 'count' } as const

/**
 * Bars of how many records of `item.resource` point at the record (`l.trend`), per bucket of their date over the
 * item's range, under a line with their total over that range: one `:aggregate` read with the reader's access, read
 * again when the records change. With none in the range the bars stay, flat, so the page below does not move.
 */
export const RecordTrendSection = ({ item, recordKey }: { item: RecordTrendModel; recordKey: string }) => {
  const filter = printFilter(where.eq(item.field, recordKey))
  const result = useAggregate(item.resource, { groupBy: item.at, filter, granularity: item.granularity, range: item.range, timeZone: viewerZone() })
  const body = () => {
    if (result.isPending) return <Skeleton className="h-[calc(10rem+2rem)] w-full" />
    if (result.error) return <ErrorBanner title={text('couldNotLoad')} error={result.error} onRetry={() => void result.refetch()} />
    const total = result.data.groups.reduce((sum, group) => sum + group.count, 0)
    return (
      <>
        <p className="mb-3 leading-5 text-foreground">{trendSummary(total, item.range)}</p>
        <PeriodChart points={periodPoints(result.data.groups, count)} measure={count} bucket={item.granularity} type="bar" />
      </>
    )
  }
  return (
    <Section title={item.title} help={item.help}>
      <div aria-busy={result.isPending}>{body()}</div>
    </Section>
  )
}
