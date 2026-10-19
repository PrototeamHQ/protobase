import type { ViewModel } from '@protobase/schema'
import { filteredListAddress } from '../list-link'
import { AppLink } from '../use-app-address'
import { measureText, type ChartMeasure, type ChartSlice } from './chart-groups'
import { text } from './messages'

/**
 * A ranked list of a field's values, each a bar as long as its number and a link to its records. Bars in rows read on
 * a phone as well as on a desk, and carry their label and value as text, so no colour has to say what a bar is.
 */
export const GroupBars = ({ resource, view, slices, measure }: { resource: string; view: ViewModel | undefined; slices: ChartSlice[]; measure: ChartMeasure }) => {
  const largest = Math.max(0, ...slices.map((slice) => slice.value ?? 0))
  return (
    <ul className="flex flex-col gap-1">
      {slices.map((slice) => {
        const share = largest > 0 && slice.value !== null ? Math.max(0, slice.value) / largest : 0
        return (
          <li key={slice.key}>
            <AppLink
              to={filteredListAddress(view, resource, slice.filter)}
              className="group grid grid-cols-[minmax(6rem,35%)_1fr_auto] items-center gap-3 rounded-md px-1 py-1 hover:bg-muted"
              title={measure.kind === 'count' ? undefined : text('records', measureText(slice.count, { kind: 'count' }))}
            >
              <span className="truncate group-hover:text-primary-text">{slice.label}</span>
              <span className="h-3 rounded-r bg-muted" aria-hidden>
                <span className="block h-full rounded-r" style={{ width: `${share * 100}%`, background: 'var(--chart-1)' }} />
              </span>
              <span className="text-right font-medium tabular-nums">{measureText(slice.value, measure)}</span>
            </AppLink>
          </li>
        )
      })}
    </ul>
  )
}
