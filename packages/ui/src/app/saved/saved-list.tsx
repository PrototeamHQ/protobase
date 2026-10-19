import type { ReactNode } from 'react'
import type { FilterExpr, ResourceModel, ViewModel } from '@protobase/schema'
import { PageHeader } from '../../app-shell'
import { humanize } from '../../live/naming'
import { Skeleton } from '../../primitives/skeleton'
import { ErrorBanner } from '../error-banner'
import { savedScope } from './saved-records'
import { useSavedRecords } from './use-saved-records'
import { text } from './messages'

type SavedListProps = {
  /** The resource of the saved records, such as favorites. */
  model: ResourceModel
  /** Its view, whose `listOf` names the relation to the saved records' targets. */
  view: ViewModel
  /** The resource that relation points at, such as listings. */
  target: ResourceModel
  /** The target's list, filtered to the saved records. */
  children: (scope: FilterExpr) => ReactNode
}

/**
 * The list page of a view with `listOf`: the records the user's saved ones point at, in their own resource's list, once
 * the saved ones have loaded; until then, or when there are none, the page says so under the view's title.
 */
export const SavedList = ({ model, view, target, children }: SavedListProps) => {
  const saved = useSavedRecords(model.name, view.listOf!, true)
  const plural = view.names?.plural ?? humanize(model.name)
  const frame = (body: ReactNode) => (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
      <PageHeader title={plural} subtitle={view.help} />
      {body}
    </div>
  )
  if (saved.error) return frame(<ErrorBanner title={text('couldNotLoadYour', plural.toLowerCase())} error={saved.error} />)
  if (!saved.data) return frame(<div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div>)
  const scope = savedScope(target, saved.data)
  if (!scope) return frame(<p className="py-8 text-center text-muted-foreground">{text('noneYet', plural.toLowerCase())}</p>)
  return children(scope)
}
