import type { ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import type { RowSource } from '../../data-grid'
import { usePagedRows } from '../../data-grid/use-paged-rows'
import { Skeleton } from '../../primitives/skeleton'
import { SnapRow } from '../../primitives/snap-row'
import { useSnapScroll } from '../../primitives/use-snap-scroll'
import { displayRow, type ListDisplayRow } from '../displays/list-displays'
import { RecordCard } from '../displays/record-card'
import { rowPlaces, rowSpan, rowWindow } from './row-window'
import { text } from './messages'

type CardsDisplayModel = Extract<ListDisplayModel, { kind: 'cards' }>

type RecordRowProps = {
  model: ResourceModel
  view: ViewModel | undefined
  display: CardsDisplayModel
  source: RowSource
  /** What the cards are, such as "Homes", for the list's label. */
  label: string
  /** Whether a record is new to the user, marked "New" in its card's top left corner. */
  isNew?: (row: ListDisplayRow) => boolean
}

// The cards far from the view, as wide as they are together: the row keeps its length, and a swipe does not stop in it
const Spacer = ({ count }: { count: number }) => <li aria-hidden style={{ width: rowSpan(count), minWidth: 0, scrollSnapAlign: 'none' }} />

/**
 * Records as the cards of their list, in a `SnapRow`: only the cards near the view are drawn, and the records are loaded
 * through the list API in pages as the row scrolls to them. Each card links to its record. Every record near the view has
 * its place, an empty one until it is drawn, so the row snaps to a card a fast swipe reaches before it is drawn; the
 * records further away stand together in a spacer at each end, so a row of a large list draws a few hundred elements.
 */
export const RecordRow = ({ model, view, display, source, label, isNew }: RecordRowProps) => {
  const { total } = source
  const shown = (scrolled: { left: number; width: number }) => rowWindow(scrolled.left, scrolled.width, total)
  const scroll = useSnapScroll((scrolled) => {
    const { start, end } = shown(scrolled)
    return `${start}-${end}`
  })
  const { start, end } = shown(scroll.view)
  const places = rowPlaces(start, end, total)
  const getRow = usePagedRows({ total, rowAt: source.rowAt, loadRows: source.loadRows, revision: source.revision, latencyMs: 0 }, start, Math.max(start, end - 1))
  return (
    <SnapRow scroll={scroll} label={label}>
      {places.from > 0 && <Spacer count={places.from} />}
      {Array.from({ length: places.to - places.from }, (_, offset) => {
        const index = places.from + offset
        if (index < start || index >= end) return <li key={`place-${index}`} aria-hidden />
        const loaded = getRow(index)
        if (!loaded) {
          return (
            <li key={`skeleton-${index}`} aria-hidden>
              <Skeleton className="h-full min-h-24 rounded-lg" />
            </li>
          )
        }
        const row = displayRow(model, loaded)
        return (
          <li key={row.key} aria-posinset={index + 1} aria-setsize={total} className="grid grid-cols-[minmax(0,1fr)]">
            <RecordCard model={model} view={view} display={display} row={row} swipe={false} mark={isNew?.(row) ? text('new') : undefined} />
          </li>
        )
      })}
      {places.to < total && <Spacer count={total - places.to} />}
    </SnapRow>
  )
}
