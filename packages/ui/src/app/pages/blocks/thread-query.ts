import { threadSort, type ThreadProps } from '@protobase/layout'
import { listPagesQuery } from '../../../data/use-list'
import { listLabels } from '../../../live/relation-labels'
import { blockPages, type BlockQueries } from '../block-query'
import { propsOf } from './block-props'

/** A `Thread`'s latest messages, their senders named, and its `calls` part the latest tool calls, as `MessageThread` reads them. */
export const threadQueries: BlockQueries = (node, read, { client, resources, views }) => {
  const { resource, filter, sender, time, calls, limit = 50 } = propsOf<ThreadProps>(node)
  if (read.part === 'calls') {
    const model = calls && resources[calls.resource]
    return model ? [blockPages(listPagesQuery(client, model.name, { filter: calls.filter, orderBy: threadSort(calls.time), pageSize: limit }))] : []
  }
  const model = resources[resource]
  if (!model) return []
  const labels = listLabels(resources, views, model, [sender])
  return [blockPages(listPagesQuery(client, model.name, { filter, orderBy: threadSort(time), pageSize: limit, labels }))]
}
