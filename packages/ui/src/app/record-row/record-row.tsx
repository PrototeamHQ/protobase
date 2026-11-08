import type { ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import type { RowSource } from '../../data-grid'
import { usePagedRows } from '../../data-grid/use-paged-rows'
import { Skeleton } from '../../primitives/skeleton'
import { SnapRow } from '../../primitives/snap-row'
import { useSnapScroll } from '../../primitives/use-snap-scroll'
import { displayRow, type ListDisplayRow } from '../displays/list-displays'
import { RecordCard } from '../displays/record-card'
import { rowCardGap, rowOffset, rowWindow } from './row-window'
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

/** Stands in for the cards before or after the ones drawn, as wide as they would be, and no place to snap to. */
const Spacer = ({ cards }: { cards: number }) => (cards > 0 ? <li aria-hidden style={{ width: rowOffset(cards) - rowCardGap, minWidth: 0, scrollSnapAlign: 'none' }} /> : null)

/**
 * Records as the cards of their list, in a `SnapRow`: only the cards near the view are drawn, and the records are loaded
 * through the list API in pages as the row scrolls to them. Each card links to its record.
 */
export const RecordRow = ({ model, view, display, source, label, isNew }: RecordRowProps) => {
  const { total } = source
  const shown = (scrolled: { left: number; width: number }) => rowWindow(scrolled.left, scrolled.width, total)
  const scroll = useSnapScroll((scrolled) => {
    const { start, end } = shown(scrolled)
    return `${start}-${end}`
  })
  const { start, end } = shown(scroll.view)
  const getRow = usePagedRows({ total, rowAt: source.rowAt, loadRows: source.loadRows, revision: source.revision, latencyMs: 0 }, start, Math.max(start, end - 1))
  const indexes = Array.from({ length: end - start }, (_, offset) => start + offset)

  return (
    <SnapRow scroll={scroll} label={label}>
      <Spacer cards={start} />
      {indexes.map((index) => {
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
      <Spacer cards={total - end} />
    </SnapRow>
  )
}
