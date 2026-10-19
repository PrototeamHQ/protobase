import type { GroupChartModel, ResourceModel, ViewModel } from '@protobase/schema'
import { humanize } from '../live/naming'
import { ChartView } from './charts/chart-view'
import { text as appText } from './messages'

const measureTitle = (chart: GroupChartModel, view: ViewModel | undefined, plural: string) => {
  const name = chart.sum ?? chart.average
  if (name === undefined) return plural
  const label = view?.fields[name]?.label ?? humanize(name)
  return chart.sum !== undefined ? `${label}` : appText('average', label)
}

/** The view's chart per value of a field, above the list and following its filter. */
export const ListGroupChart = ({ model, view, chart, plural, filter }: { model: ResourceModel; view: ViewModel | undefined; chart: GroupChartModel; plural: string; filter: string }) => {
  const by = view?.fields[chart.groupBy]?.label ?? humanize(chart.groupBy)
  return (
    <section className="rounded-lg border bg-background px-4 pb-3 pt-3" aria-label={`${measureTitle(chart, view, plural)} by ${by.toLowerCase()}`}>
      <h2 className="mb-2 font-semibold">
        {measureTitle(chart, view, plural)} by {by.toLowerCase()}
      </h2>
      <ChartView model={model} view={view} groupBy={chart.groupBy} type={chart.type} sum={chart.sum} average={chart.average} limit={chart.limit} filter={filter} />
    </section>
  )
}
