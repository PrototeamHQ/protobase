import type { ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import { cn } from '../../lib/cn'
import { humanize } from '../../live/naming'
import { Skeleton } from '../../primitives/skeleton'
import type { ListDisplay } from './display-context'
import { DisplayFooter, DisplayState } from './display-frame'
import { RecordCard } from './record-card'
import { text } from './messages'

type CardsProps = {
  model: ResourceModel
  view: ViewModel | undefined
  display: Extract<ListDisplayModel, { kind: 'cards' }>
  list: ListDisplay
  /** The cards in one row that scrolls sideways, card by card, instead of a grid, as an embedded list shows them on a phone. */
  row?: boolean
  /** How many are shown and a button for more, under the cards; an embedded list, which links to the list instead, leaves it out. */
  footer?: boolean
}

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3'
// Positioned, so the cards' screen-reader labels scroll inside it instead of widening the page
const scroller = 'relative flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1'

/** A card per record (see `RecordCard`), in a grid or a row, with how many match and a button for more below. */
export const CardsDisplay = ({ model, view, display, list, row = false, footer = true }: CardsProps) => {
  const plural = (view?.names?.plural ?? humanize(model.name)).toLowerCase()
  return (
    <DisplayState list={list} empty={text('noneMatch', { plural })} loading={<div className={grid}>{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div>}>
      <ul className={row ? scroller : grid} aria-label={view?.names?.plural ?? humanize(model.name)}>
        {list.rows.map((record) => (
          <li key={record.key} className={cn(row && 'w-64 shrink-0 snap-start')}>
            <RecordCard model={model} view={view} display={display} row={record} swipe={!row} />
          </li>
        ))}
      </ul>
      {footer && <DisplayFooter list={list} />}
    </DisplayState>
  )
}
