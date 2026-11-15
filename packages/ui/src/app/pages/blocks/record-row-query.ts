import type { RecordRowProps } from '@protobase/layout'
import { liveFirstPageQuery } from '../../../live/use-live-rows'
import { recordRowRead } from '../../record-row/record-row-read'
import { blockQuery, type BlockQueries } from '../block-query'
import { propsOf } from './block-props'

/**
 * A `RecordRow`'s first page, as `RecordRowBody` reads it; the rows of a view with `listOf` or `searchesOf`, which read
 * the user's saved records or searches first, read as they draw.
 */
export const recordRowQueries: BlockQueries = (node, _read, { client, queryClient, resources, views }) => {
  const { resource, filter = '', sort = '' } = propsOf<RecordRowProps>(node)
  const model = resources[resource]
  if (!model) return []
  const view = views[model.name]
  if (view?.searchesOf || view?.listOf !== undefined) return []
  return [blockQuery(liveFirstPageQuery({ queryClient, client, resources, views, model, ...recordRowRead(model, view, { filter, sort }) }))]
}
