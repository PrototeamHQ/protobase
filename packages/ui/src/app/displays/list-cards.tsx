import type { ReactNode } from 'react'
import type { ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import type { RowSource } from '../../data-grid'
import { humanize } from '../../live/naming'
import { Skeleton } from '../../primitives/skeleton'
import { ErrorBanner } from '../error-banner'
import { displayRow } from './list-displays'
import { RecordCard } from './record-card'
import { VirtualCards } from './virtual-cards'
import { text } from './messages'

/** The list page's rows, as `useLiveRows` loads them, and where in them to start. */
export type CardsList = {
  source: RowSource | undefined
  error: Error | null
  isLoading: boolean
  initialIndex: number
  onScrollIndex: (index: number) => void
}

type ListCardsProps = { model: ResourceModel; view: ViewModel | undefined; display: Extract<ListDisplayModel, { kind: 'cards' }>; list: CardsList; empty?: ReactNode }

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3'

// A built-in card is at least its padding and title, under a 4:3 picture when it shows one
const pictureHeight = (width: number) => width * 0.75
const plainHeight = 44

/**
 * The list page's cards display: a card per record (see `RecordCard`), scrolled like the table. An embedded list,
 * which shows a few cards whole, draws them with `CardsDisplay`.
 */
export const ListCards = ({ model, view, display, list, empty }: ListCardsProps) => {
  const plural = view?.names?.plural ?? humanize(model.name)
  const pictured = display.card === undefined && (display.image !== undefined || display.photos !== undefined)
  if (list.isLoading) {
    return <div className={`min-h-0 flex-1 overflow-hidden ${grid}`}>{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div>
  }
  if (list.error) return <ErrorBanner title={text('couldNotLoadRows')} error={list.error} />
  if (!list.source || list.source.total === 0) return empty ?? <p className="py-8 text-center text-muted-foreground">{text('noneMatch', { plural: plural.toLowerCase() })}</p>
  return (
    <VirtualCards
      source={list.source}
      label={plural}
      initialIndex={list.initialIndex}
      onScrollIndex={list.onScrollIndex}
      minHeight={(width) => (pictured ? pictureHeight(width) : 0) + plainHeight}
    >
      {(row) => <RecordCard model={model} view={view} display={display} row={displayRow(model, row)} />}
    </VirtualCards>
  )
}
