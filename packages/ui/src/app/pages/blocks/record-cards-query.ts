import type { RecordCardsProps } from '@protobase/layout'
import { defaultOrderBy } from '../../list-order'
import { blockQuery, type BlockQueries } from '../block-query'
import { countQuery, listPageQuery } from '../use-layout-data'
import { propsOf } from './block-props'

/** A `RecordCards`' first page and how many records match in all, as `RelatedCards` reads them. */
export const recordCardsQueries: BlockQueries = (node, _read, { client, resources, views }) => {
  const { resource, filter = '', sort = '', limit = 10 } = propsOf<RecordCardsProps>(node)
  const model = resources[resource]
  if (!model) return []
  const orderBy = sort || defaultOrderBy(model, views[model.name])
  return [blockQuery(listPageQuery(client, model, { filter, sort: orderBy, pageSize: limit })), blockQuery(countQuery(client, model, filter))]
}
