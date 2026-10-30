import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import type { RowSource } from '../../data-grid'
import { usePagedRows } from '../../data-grid/use-paged-rows'
import { Skeleton } from '../../primitives/skeleton'
import { displayRow, type ListDisplayRow } from '../displays/list-displays'
import { RecordCard } from '../displays/record-card'
import { rowCardGap, rowCardWidth, rowOffset } from './row-window'
import { useRowScroll } from './use-row-scroll'
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

const arrowClass = 'absolute top-1/2 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border-strong bg-background shadow-pop hover:bg-muted sm:flex'

/** Stands in for the cards before or after the ones drawn, as wide as they would be. */
const Spacer = ({ cards }: { cards: number }) => (cards > 0 ? <li aria-hidden className="shrink-0" style={{ width: rowOffset(cards) - rowCardGap }} /> : null)

/**
 * Records as the cards of their list, in one row that scrolls sideways by touch, trackpad or its arrow buttons: only the
 * cards near the view are drawn, and the records are loaded through the list API in pages as the row scrolls to them.
 * Each card links to its record.
 */
export const RecordRow = ({ model, view, display, source, label, isNew }: RecordRowProps) => {
  const { total } = source
  const scroll = useRowScroll(total)
  const getRow = usePagedRows({ total, rowAt: source.rowAt, loadRows: source.loadRows, revision: source.revision, latencyMs: 0 }, scroll.start, Math.max(scroll.start, scroll.end - 1))
  const indexes = Array.from({ length: scroll.end - scroll.start }, (_, offset) => scroll.start + offset)

  return (
    <div className="relative min-w-0">
      <ul ref={scroll.ref} aria-label={label} className="relative flex snap-x gap-3 overflow-x-auto overflow-y-hidden pb-1" style={{ scrollbarWidth: 'thin' }}>
        <Spacer cards={scroll.start} />
        {indexes.map((index) => {
          const loaded = getRow(index)
          if (!loaded) {
            return (
              <li key={`skeleton-${index}`} aria-hidden className="shrink-0" style={{ width: rowCardWidth }}>
                <Skeleton className="h-full min-h-24 rounded-lg" />
              </li>
            )
          }
          const row = displayRow(model, loaded)
          return (
            <li key={row.key} aria-posinset={index + 1} aria-setsize={total} className="grid shrink-0 snap-start grid-cols-[minmax(0,1fr)]" style={{ width: rowCardWidth }}>
              <RecordCard model={model} view={view} display={display} row={row} swipe={false} mark={isNew?.(row) ? text('new') : undefined} />
            </li>
          )
        })}
        <Spacer cards={total - scroll.end} />
      </ul>
      {scroll.back && (
        <button type="button" aria-label={text('previous', { label: label.toLowerCase() })} onClick={() => scroll.page(-1)} className={`${arrowClass} -left-3`}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      )}
      {scroll.on && (
        <button type="button" aria-label={text('next', { label: label.toLowerCase() })} onClick={() => scroll.page(1)} className={`${arrowClass} -right-3`}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}
