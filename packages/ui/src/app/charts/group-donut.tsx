import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { ViewModel } from '@protobase/schema'
import { filteredListAddress } from '../list-link'
import { AppLink } from '../use-app-address'
import { measureText, type ChartMeasure, type ChartSlice } from './chart-groups'

const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '')

const SliceTooltip = ({ active, payload, measure }: { active?: boolean; payload?: Array<{ payload: ChartSlice }>; measure: ChartMeasure }) => {
  const slice = payload?.[0]?.payload
  if (!active || !slice) return null
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-pop">
      <div className="text-muted-foreground">{slice.label}</div>
      <div className="font-semibold tabular-nums">{measureText(slice.value, measure)}</div>
    </div>
  )
}

/**
 * A donut of how a total shares out over a field's values, with a legend that names each, gives its number and share,
 * and links to its records: the legend, not the colour, says which slice is which.
 */
export const GroupDonut = ({ resource, view, slices, measure }: { resource: string; view: ViewModel | undefined; slices: ChartSlice[]; measure: ChartMeasure }) => {
  const drawn = slices.filter((slice) => slice.value !== null && slice.value > 0)
  const whole = drawn.reduce((sum, slice) => sum + slice.value!, 0)
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="size-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={drawn} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={drawn.length > 1 ? 1 : 0} stroke="var(--background)" strokeWidth={2} isAnimationActive={false}>
              {drawn.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip content={<SliceTooltip measure={measure} />} isAnimationActive={false} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-0.5">
        {slices.map((slice) => (
          <li key={slice.key}>
            <AppLink to={filteredListAddress(view, resource, slice.filter)} className="group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: slice.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate group-hover:text-primary-text">{slice.label}</span>
              <span className="font-medium tabular-nums">{measureText(slice.value, measure)}</span>
              <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{percent(slice.value ?? 0, whole)}</span>
            </AppLink>
          </li>
        ))}
      </ul>
    </div>
  )
}
