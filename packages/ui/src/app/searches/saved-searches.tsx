import type { ReactNode } from 'react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { PageHeader } from '../../app-shell'
import { recordKey } from '../../live/model-helpers'
import { humanize } from '../../live/naming'
import { Skeleton } from '../../primitives/skeleton'
import { useDeleteFlow } from '../delete/use-delete-flow'
import { ErrorBanner } from '../error-banner'
import { Notice, useAdminMeta, usePermissions } from '../meta-gate'
import { can } from '../permissions'
import { AppLink } from '../use-app-address'
import { SavedSearchSection } from './saved-search-section'
import { useSavedSearches } from './use-saved-searches'
import { text } from './messages'

/**
 * The list page of a view with `searchesOf`: each of the user's saved searches, with what it finds (`SavedSearchSection`),
 * in the order of the view's list; until they have loaded, or when there are none, the page says so under its title.
 */
export const SavedSearches = ({ model, view }: { model: ResourceModel; view: ViewModel }) => {
  const { resources, views } = useAdminMeta()
  const of = view.searchesOf!
  const target = resources[of.resource]
  const targetView = views[of.resource]
  const saved = useSavedSearches(model.name, true)
  const permissions = usePermissions(model.name)
  const remove = useDeleteFlow({ model, view })
  const plural = view.names?.plural ?? humanize(model.name)

  const frame = (body: ReactNode) => (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
      {remove.dialogs}
      <PageHeader title={plural} subtitle={view.help} />
      {body}
    </div>
  )
  if (!target) return frame(<Notice title={text('notFound')}>{text.rich('noResource', { resource: of.resource })}</Notice>)
  if (saved.error) return frame(<ErrorBanner title={text('couldNotLoadYour', { plural: plural.toLowerCase() })} error={saved.error} />)
  if (!saved.data) return frame(<div className="flex flex-col gap-3">{Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-56" />)}</div>)
  if (saved.data.length === 0) {
    const searched = (targetView?.names?.plural ?? humanize(target.name)).toLowerCase()
    return frame(
      <p className="py-8 text-center text-muted-foreground">
        {text.rich('noSavedYet', {
          plural: plural.toLowerCase(),
          list: (
            <AppLink to={{ kind: 'list', resource: target.name }} className="font-medium text-primary-text hover:underline">
              {searched}
            </AppLink>
          ),
        })}
      </p>,
    )
  }
  return frame(
    <div className="flex flex-col gap-4">
      {saved.data.map((row) => {
        const key = encodeKey(recordKey(model, row))
        const onDelete = can(permissions, 'delete') ? (title: string) => void remove.start({ key, title, etag: row.etag, snapshot: row }) : undefined
        return <SavedSearchSection key={key} model={model} view={view} of={of} target={target} targetView={targetView} row={row} recordKey={key} canRename={can(permissions, 'update')} onDelete={onDelete} />
      })}
    </div>,
  )
}
