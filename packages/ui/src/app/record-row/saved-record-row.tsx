import type { ResourceModel, ViewModel } from '@protobase/schema'
import { humanize } from '../../live/naming'
import { Skeleton } from '../../primitives/skeleton'
import { listedResource } from '../current-address'
import { ErrorBanner } from '../error-banner'
import { useAdminMeta } from '../meta-gate'
import { savedScope } from '../saved/saved-records'
import { useSavedRecords } from '../saved/use-saved-records'
import { RecordRowBody, type RecordRowBodyProps } from './record-row-body'
import { text } from './messages'

type SavedRecordRowProps = Omit<RecordRowBodyProps, 'model' | 'view' | 'filter' | 'sort' | 'scope' | 'list'> & {
  /** The saved records' resource, such as favorites, and its view, whose `listOf` names what they point at. */
  model: ResourceModel
  view: ViewModel
}

/**
 * The records the user's saved ones of a view with `listOf` point at, such as the listings among their favorites, as a
 * row of their own resource's cards, with "View all" to the saved records' list. `empty` when there are none.
 */
export const SavedRecordRow = ({ model, view, empty, ...props }: SavedRecordRowProps) => {
  const { resources, views } = useAdminMeta()
  const listed = listedResource(resources, views, model.name)
  const saved = useSavedRecords(model.name, view.listOf!, true)
  const plural = (view.names?.plural ?? humanize(model.name)).toLowerCase()
  if (!listed.listOf) return null
  if (saved.error) return <ErrorBanner title={text('couldNotLoadYour', plural)} error={saved.error} />
  if (!saved.data) return <Skeleton className="h-24" />
  const scope = savedScope(listed.model!, saved.data)
  if (!scope) return <p className="text-muted-foreground">{empty ?? text('noneYet', plural)}</p>
  return <RecordRowBody {...props} model={listed.model!} view={listed.view} filter="" scope={scope} list={model.name} empty={empty} />
}
