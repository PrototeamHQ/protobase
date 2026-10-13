import type { ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import { humanize } from '../../live/naming'
import { Skeleton } from '../../primitives/skeleton'
import type { ListDisplay } from './display-context'
import { DisplayFooter, DisplayState } from './display-frame'
import { RecordCard } from './record-card'

type CardsProps = { model: ResourceModel; view: ViewModel | undefined; display: Extract<ListDisplayModel, { kind: 'cards' }>; list: ListDisplay }

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3'

/** A card per record (see `RecordCard`), in a grid, with how many match and a button for more below. */
export const CardsDisplay = ({ model, view, display, list }: CardsProps) => {
  const plural = (view?.names?.plural ?? humanize(model.name)).toLowerCase()
  return (
    <DisplayState list={list} empty={`No ${plural} match.`} loading={<div className={grid}>{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div>}>
      <ul className={grid} aria-label={view?.names?.plural ?? humanize(model.name)}>
        {list.rows.map((row) => (
          <li key={row.key}>
            <RecordCard model={model} view={view} display={display} row={row} />
          </li>
        ))}
      </ul>
      <DisplayFooter list={list} />
    </DisplayState>
  )
}
