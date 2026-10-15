import type { ResourceModel, ViewModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { recordKey } from '../../live/model-helpers'
import { humanize } from '../../live/naming'
import { Skeleton } from '../../primitives/skeleton'
import { ErrorBanner } from '../error-banner'
import { useAdminMeta } from '../meta-gate'
import { RecordRowBody } from '../record-row/record-row-body'
import { AppLink } from '../use-app-address'
import { InlineFilterChips } from './filter-chip-list'
import { useSavedSearches, type SavedSearchRow } from './use-saved-searches'
import { useSearchRow } from './use-search-row'

type SearchRowItemProps = { model: ResourceModel; view: ViewModel; target: ResourceModel; targetView: ViewModel | undefined; row: SavedSearchRow }

const SearchRowItem = ({ model, view, target, targetView, row }: SearchRowItemProps) => {
  const key = encodeKey(recordKey(model, row))
  const { name, chips, title, body } = useSearchRow({ model, of: view.searchesOf!, target, targetView, row, recordKey: key })
  return (
    <section aria-label={title} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <h3 className="text-[14px] font-semibold">
        <AppLink to={{ kind: 'record', resource: model.name, key }} className="hover:underline">
          {name ?? <InlineFilterChips chips={chips} />}
        </AppLink>
      </h3>
      <RecordRowBody {...body} />
    </section>
  )
}

/**
 * The user's saved searches of a view with `searchesOf`, for a page: each with its name or filters, linking to it, over
 * the row of what it finds (`useSearchRow`), in the order of their list. `empty` when there are none.
 */
export const SavedSearchRows = ({ model, view, empty }: { model: ResourceModel; view: ViewModel; empty?: string }) => {
  const { resources, views } = useAdminMeta()
  const of = view.searchesOf!
  const target = resources[of.resource]
  const saved = useSavedSearches(model.name, true)
  const plural = (view.names?.plural ?? humanize(model.name)).toLowerCase()
  if (!target) return null
  if (saved.error) return <ErrorBanner title={`Could not load your ${plural}`} error={saved.error} />
  if (!saved.data) return <Skeleton className="h-40" />
  if (saved.data.length === 0) return <p className="text-[13px] text-muted-foreground">{empty ?? `No ${plural} yet.`}</p>
  return (
    <div className="flex flex-col divide-y">
      {saved.data.map((row) => (
        <SearchRowItem key={encodeKey(recordKey(model, row))} model={model} view={view} target={target} targetView={views[of.resource]} row={row} />
      ))}
    </div>
  )
}
