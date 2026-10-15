import type { RecordRowProps } from '@protobase/layout'
import { useAdminMeta } from '../../meta-gate'
import { RecordRowBody } from '../../record-row/record-row-body'
import { SavedRecordRow } from '../../record-row/saved-record-row'
import { SavedSearchRows } from '../../searches/saved-search-rows'
import { propsOf, type BlockProps } from './block-props'
import { CardFrame } from './card-frame'

/**
 * What a filter finds: its chips, the count, its records as a sideways row of their list's cards, and "View all". Of a
 * resource whose view has `listOf`, the records the user's saved ones point at; of one with `searchesOf`, a row per
 * saved search of the user's.
 */
export const RecordRowBlock = ({ node, slots }: BlockProps) => {
  const { resource, filter = '', sort, limit, display, title, description, empty } = propsOf<RecordRowProps>(node)
  const { resources, views } = useAdminMeta()
  const model = resources[resource]
  if (!model) return null
  const view = views[model.name]
  const body = () => {
    if (view?.searchesOf) return <SavedSearchRows model={model} view={view} empty={empty} />
    if (view?.listOf !== undefined) return <SavedRecordRow model={model} view={view} limit={limit} display={display} empty={empty} />
    return <RecordRowBody model={model} view={view} filter={filter} sort={sort} limit={limit} display={display} empty={empty} />
  }
  return (
    <CardFrame title={title} description={description} actions={slots.actions}>
      {body()}
    </CardFrame>
  )
}
