import { threadSort } from '@protobase/layout'
import type { ResourceModel, ToolCallFields } from '@protobase/schema'
import { useList } from '../../data/use-list'
import { recordKey } from '../../live/model-helpers'
import { useAdminMeta } from '../meta-gate'
import { callKey, toolCallOf } from './tool-calls'

/** The latest `limit` tool calls of a thread, newest first, with earlier ones on request; none without `calls`. */
export const useToolCalls = (calls: { model: ResourceModel; filter?: string; fields: ToolCallFields } | undefined, limit: number) => {
  const { views } = useAdminMeta()
  const name = calls?.model.name ?? ''
  const list = useList(name, { filter: calls?.filter, orderBy: calls && threadSort(calls.fields.time), pageSize: limit, enabled: calls !== undefined })
  if (!calls) return { calls: [], hasNextPage: false, isFetchingNextPage: false, list, statusHints: undefined }
  return {
    calls: list.items.map((row) => toolCallOf(row, callKey(recordKey(calls.model, row)), calls.fields)),
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    list,
    statusHints: views[name]?.fields[calls.fields.status],
  }
}
