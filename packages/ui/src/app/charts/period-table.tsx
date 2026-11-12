import { measureText, type ChartMeasure } from './chart-groups'
import { text } from './messages'
import type { PeriodBucket, Point } from './period-chart'
import { periodText } from './period-text'
import type { ChartSeries } from './split-points'

/**
 * A chart's buckets and their numbers as a table only a screen reader reads: per bucket its period and what its tooltip
 * shows, each part of a split and the total where the parts add up to one.
 */
export const PeriodTable = ({ points, measure, bucket, now, series }: { points: Point[]; measure: ChartMeasure; bucket: PeriodBucket; now: number; series?: ChartSeries[] }) => {
  const parts = series ?? []
  const total = !series || measure.kind === 'count' || measure.kind === 'sum'
  // A table sizes to its content whatever its width, so the box that hides it is a block around it
  return (
    <div className="sr-only">
      <table>
        <thead>
          <tr>
            <th scope="col">{text('period')}</th>
            {parts.map((part) => (
              <th key={part.key} scope="col">
                {part.label}
              </th>
            ))}
            {total && <th scope="col">{text(measure.kind)}</th>}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.at}>
              <th scope="row">{periodText(point.at, bucket, now)}</th>
              {parts.map((part) => (
                <td key={part.key}>{measureText(point[part.key] ?? null, part.measure ?? measure)}</td>
              ))}
              {total && <td>{measureText(point.value, measure)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
