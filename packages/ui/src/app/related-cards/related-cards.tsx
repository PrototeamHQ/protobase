import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import type { ResourceModel, RowButtonModel, ViewModel } from '@protobase/schema'
import { useIsXs } from '../../lib/use-media-query'
import { humanize } from '../../live/naming'
import { Skeleton } from '../../primitives/skeleton'
import { SnapRow } from '../../primitives/snap-row'
import { useSnapScroll } from '../../primitives/use-snap-scroll'
import { cutOffNote } from '../embedded-list/cut-off-note'
import { embeddedDisplay, viewAllAddress } from '../embedded-list/embedded-display'
import { text as listText } from '../embedded-list/messages'
import { ErrorBanner } from '../error-banner'
import { defaultOrderBy } from '../list-order'
import { scopeOf, useCount, useListPage } from '../pages/use-layout-data'
import { AppLink } from '../use-app-address'
import { CompactCard } from './compact-card'
import { RelatedCard } from './related-card'
import { text } from './messages'
import { useLeavingFocus } from './use-leaving-focus'

type RelatedCardsProps = {
  model: ResourceModel
  view: ViewModel | undefined
  filter: string
  /** The order of the cards, the list's own when empty. */
  sort: string
  /** The fields each card shows. */
  fields: string[]
  /** The named actions of the view each card has buttons for. */
  actions: string[]
  /** A button on each card to an address the record's fields name. */
  button?: RowButtonModel
  limit: number
  /** The display of the list "View all" opens. */
  display: string | undefined
  empty?: string
  /** Each card's share of the width in one row that scrolls sideways, snapping each card to its left edge; stacked when omitted. */
  carousel?: number
  /** Cards of one or two lines, with this date or timestamp field beside the title, or `{}` for none. */
  compact?: { time?: string }
  /** The enum field whose value colours each card's left edge. */
  tone?: string
}

// Compact cards are two lines high, a long title taking a third on a phone; three of them hold the room a
// short list takes, so the page below barely moves when they load
const CardsSkeleton = ({ compact, limit }: { compact: boolean; limit: number }) => (
  <div className={compact ? 'flex flex-col gap-2' : 'flex flex-col gap-3'}>
    {Array.from({ length: compact ? Math.min(limit, 3) : 2 }, (_, index) => <Skeleton key={index} className={compact ? 'h-17.5 w-full max-sm:h-24' : 'h-24 w-full'} />)}
  </div>
)

/**
 * The first `limit` records of a list as cards stacked full width or in a `carousel`, each with its fields, its
 * actions' buttons and its row button, and a link to the whole list beside a note such as "The first 10 of 37." when there are more.
 */
export const RelatedCards = ({ model, view, filter, sort, fields, actions, button, limit, display, empty, carousel, compact, tone }: RelatedCardsProps) => {
  const xs = useIsXs()
  const scroll = useSnapScroll()
  const plural = view?.names?.plural ?? humanize(model.name)
  const orderBy = sort || defaultOrderBy(model, view)
  const page = useListPage(model, { filter, sort: orderBy, pageSize: limit })
  const count = useCount(model, filter)
  const scopes = useMemo(() => (page.data?.items ?? []).map((row) => scopeOf(model, row)), [model, page.data])
  const keys = useMemo(() => scopes.map((scope) => scope.key), [scopes])
  const leaving = useLeavingFocus(keys)
  const content = () => {
    if (page.isPending) return <CardsSkeleton compact={Boolean(compact)} limit={limit} />
    if (page.error) return <ErrorBanner title={text('couldNotLoad')} error={page.error} />
    if (scopes.length === 0) return <p className="text-muted-foreground">{empty ?? text('nothingYet')}</p>
    const cards = scopes.map((scope) => {
      const acted = (action: string, title: string) => leaving.acted(scope.key, action, title)
      if (compact) return <CompactCard key={scope.key} scope={scope} view={view} fields={fields} time={compact.time} tone={tone} actions={actions} button={button} onActed={acted} />
      return <RelatedCard key={scope.key} scope={scope} view={view} fields={fields} tone={tone} actions={actions} button={button} onActed={acted} />
    })
    const note = count.data === undefined ? undefined : cutOffNote(scopes.length, count.data, false)
    return (
      <div className="flex flex-col gap-3">
        {carousel === undefined ? <ul className={compact ? 'flex flex-col gap-2' : 'flex flex-col gap-3'}>{cards}</ul> : (
          <SnapRow scroll={scroll} label={plural} share={carousel}>
            {cards}
          </SnapRow>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{note}</p>
          <AppLink to={viewAllAddress(model, view, xs, { filter, orderBy, display: embeddedDisplay(view, xs, { preferred: display }) })} className="flex items-center gap-1 font-medium text-primary-text hover:underline">
            {listText('viewAll')} <span className="sr-only">{plural.toLowerCase()}</span>
            <ArrowRight className="size-3.5" aria-hidden />
          </AppLink>
        </div>
      </div>
    )
  }
  // The toast says an action is done; only the cards know when it took its card out of the list
  return (
    <div ref={leaving.root}>
      {content()}
      <p role="status" className="sr-only">{leaving.announcement}</p>
    </div>
  )
}
