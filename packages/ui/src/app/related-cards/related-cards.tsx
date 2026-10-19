import { ArrowRight } from 'lucide-react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useIsXs } from '../../lib/use-media-query'
import { humanize } from '../../live/naming'
import { Skeleton } from '../../primitives/skeleton'
import { cutOffNote } from '../embedded-list/cut-off-note'
import { embeddedDisplay, viewAllAddress } from '../embedded-list/embedded-display'
import { text as listText } from '../embedded-list/messages'
import { ErrorBanner } from '../error-banner'
import { defaultOrderBy } from '../list-order'
import { scopeOf, useCount, useListPage } from '../pages/use-layout-data'
import { AppLink } from '../use-app-address'
import { RelatedCard } from './related-card'
import { text } from './messages'

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
  limit: number
  /** The display of the list "View all" opens. */
  display: string | undefined
  empty?: string
}

/**
 * The first `limit` records of a list as cards stacked full width, each with its fields and its actions' buttons, and a
 * link to the whole list beside a note such as "The first 10 of 37." when there are more.
 */
export const RelatedCards = ({ model, view, filter, sort, fields, actions, limit, display, empty }: RelatedCardsProps) => {
  const xs = useIsXs()
  const orderBy = sort || defaultOrderBy(model, view)
  const page = useListPage(model, { filter, sort: orderBy, pageSize: limit })
  const count = useCount(model, filter)
  if (page.isPending) return <div className="flex flex-col gap-3">{Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-24 w-full" />)}</div>
  if (page.error) return <ErrorBanner title={text('couldNotLoad')} error={page.error} />
  const rows = page.data.items
  if (rows.length === 0) return <p className="text-muted-foreground">{empty ?? text('nothingYet')}</p>
  const note = count.data === undefined ? undefined : cutOffNote(rows.length, count.data, false)
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const scope = scopeOf(model, row)
          return <RelatedCard key={scope.key} scope={scope} view={view} fields={fields} actions={actions} />
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{note}</p>
        <AppLink to={viewAllAddress(model, view, xs, { filter, orderBy, display: embeddedDisplay(view, xs, { preferred: display }) })} className="flex items-center gap-1 font-medium text-primary-text hover:underline">
          {listText('viewAll')} <span className="sr-only">{(view?.names?.plural ?? humanize(model.name)).toLowerCase()}</span>
          <ArrowRight className="size-3.5" aria-hidden />
        </AppLink>
      </div>
    </div>
  )
}
