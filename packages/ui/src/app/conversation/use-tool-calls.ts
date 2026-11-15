import { threadSort } from '@protobase/layout'
import type { ResourceModel, ToolCallFields } from '@protobase/schema'
import { recordKey } from '../../live/model-helpers'
import { useAdminMeta } from '../meta-gate'
import type { Planned } from '../pages/planned'
import { callKey, toolCallOf } from './tool-calls'
import { useThreadList } from './use-thread-list'

/**
 * The latest `limit` tool calls of a thread, newest first, from the page's `planned` read when it has one, with earlier
 * ones on request; none without `calls`.
 */
export const useToolCalls = (calls: { model: ResourceModel; filter?: string; fields: ToolCallFields } | undefined, limit: number, planned?: Planned) => {
  const { views } = useAdminMeta()
  const name = calls?.model.name ?? ''
  const list = useThreadList(name, { filter: calls?.filter, orderBy: calls && threadSort(calls.fields.time), pageSize: limit, enabled: calls !== undefined }, planned)
  if (!calls) return { calls: [], hasNextPage: false, isFetchingNextPage: false, list, statusHints: undefined }
  return {
    calls: list.items.map((row) => toolCallOf(row, callKey(recordKey(calls.model, row)), calls.fields)),
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    list,
    statusHints: views[name]?.fields[calls.fields.status],
  }
}
