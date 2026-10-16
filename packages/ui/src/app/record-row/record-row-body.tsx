import { ArrowRight } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { createWhere, parseFilter, printFilter, type FilterExpr, type ListDisplayModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { useIsXs } from '../../lib/use-media-query'
import { humanize } from '../../live/naming'
import { useLiveRows } from '../../live/use-live-rows'
import { Skeleton } from '../../primitives/skeleton'
import { displaysOf, loadedFields, type ListDisplayRow } from '../displays/list-displays'
import { viewAllAddress } from '../embedded-list/embedded-display'
import { ErrorBanner } from '../error-banner'
import { defaultOrderBy } from '../list-order'
import { useAdminMeta } from '../meta-gate'
import { FilterChipList } from '../searches/filter-chip-list'
import { useFilterChips } from '../searches/use-filter-chips'
import { AppLink } from '../use-app-address'
import { RecordRow } from './record-row'

type CardsDisplayModel = Extract<ListDisplayModel, { kind: 'cards' }>

const where = createWhere()

// The filter a row loads with: its own, narrowed to `scope`
const scoped = (filter: string, scope: FilterExpr | undefined) => {
  if (!scope) return filter
  const parsed = parseFilter(filter)
  if (!parsed.ok) throw new Error(`The filter cannot be read: ${parsed.errors.map((error) => error.message).join('; ')}`)
  return printFilter(parsed.ast ? where.and(parsed.ast, scope) : scope)
}

export type RecordRowBodyProps = {
  model: ResourceModel
  view: ViewModel | undefined
  /** The records shown: those matching `filter` (AIP-160) in `sort` order (AIP-132), the list's order when empty. */
  filter: string
  sort?: string
  /** The cards display of the view whose cards it draws; its first when omitted, the title alone without one. */
  display?: string
  /** How many records it shows at most; every one that matches when omitted. */
  limit?: number
  /** Whether it shows what the filter filters on, as chips. */
  chips?: boolean
  empty?: string
  /** A line about the records beside the count, such as that none are new. */
  note?: ReactNode
  isNew?: (row: ListDisplayRow) => boolean
  /** "View all"'s label, and the saved search whose results it opens, calling `onOpen` first. */
  viewAll?: { label?: string; savedSearch?: string; onOpen?: () => void }
  /** A filter every load adds to `filter`, which the chips and "View all" leave out: the records among the user's saved ones. */
  scope?: FilterExpr
  /** The resource whose list "View all" opens, the records' own by default: the saved records' list for a `scope`. */
  list?: string
}

/** The display a row draws its cards with: the one named, else the view's first cards display, else a card of the title. */
const rowDisplay = (view: ViewModel | undefined, name: string | undefined): CardsDisplayModel => {
  const cards = displaysOf(view).filter((display): display is CardsDisplayModel => display.kind === 'cards')
  return cards.find((display) => display.name === name) ?? cards[0] ?? { kind: 'cards', name: 'cards' }
}

// Three cards' worth, each as wide as a card (`rowCardWidth`)
const Loading = () => (
  <div className="flex gap-3 overflow-hidden">
    {Array.from({ length: 3 }, (_, index) => (
      <Skeleton key={index} className="h-24 w-64 shrink-0" />
    ))}
  </div>
)

/**
 * What a filter finds, in a card's body: its filters as chips, how many records match, the records in a row of their
 * list's cards that scrolls sideways (`RecordRow`), and "View all", which opens the list with the filter.
 */
export const RecordRowBody = ({ model, view, filter, sort = '', display: named, limit, chips: showChips = true, empty, note, isNew, viewAll, scope, list }: RecordRowBodyProps) => {
  const { resources, views } = useAdminMeta()
  const xs = useIsXs()
  const display = rowDisplay(view, named)
  const orderBy = sort || defaultOrderBy(model, view)
  const columns = useMemo(() => loadedFields(model, view, []), [model, view])
  const loadFilter = useMemo(() => scoped(filter, scope), [filter, scope])
  const rows = useLiveRows({ resources, views, model, columns, filter: loadFilter, orderBy })
  const chips = useFilterChips(model, filter)
  const singular = (view?.names?.singular ?? humanize(model.name)).toLowerCase()
  const plural = view?.names?.plural ?? humanize(model.name)
  const total = rows.source?.total
  const source = useMemo(() => rows.source && { ...rows.source, total: Math.min(rows.source.total, limit ?? Infinity) }, [rows.source, limit])

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {(showChips && chips.length > 0) || total !== undefined || note ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {showChips && chips.length > 0 ? <FilterChipList chips={chips} /> : <span />}
          <p className="flex flex-wrap gap-x-3 text-muted-foreground">
            {note && <span>{note}</span>}
            {total !== undefined && <span className="tabular-nums">{`${total.toLocaleString('en-GB')} ${total === 1 ? singular : plural.toLowerCase()}`}</span>}
          </p>
        </div>
      ) : null}
      {rows.isLoading ? (
        <Loading />
      ) : rows.error ? (
        <ErrorBanner title="Could not load" error={rows.error} />
      ) : !source || source.total === 0 ? (
        <p className="text-muted-foreground">{empty ?? `No ${plural.toLowerCase()} match.`}</p>
      ) : (
        <RecordRow model={model} view={view} display={display} source={source} label={plural} isNew={isNew} />
      )}
      <AppLink
        to={viewAllAddress(model, view, xs, { filter, orderBy, display: display.name, savedSearch: viewAll?.savedSearch, resource: list })}
        onClick={viewAll?.onOpen}
        className="flex items-center gap-1 self-end font-medium text-primary-text hover:underline"
      >
        {viewAll?.label ?? <>View all <span className="sr-only">{plural.toLowerCase()}</span></>}
        <ArrowRight className="size-3.5" aria-hidden />
      </AppLink>
    </div>
  )
}
