import type { ConversationPageModel, ResourceModel } from '@protobase/schema'
import { useRecord } from '../../data/use-record'
import { listLabels, withLabels } from '../../live/relation-labels'
import { keyValue } from '../create/create-values'
import { useAdminMeta } from '../meta-gate'
import { usePickedLabels } from '../use-picked-labels'
import { inConversation } from './thread-head'

/**
 * A thread's first message, keyed `first`, with its sender named as the replies' are: `row` once read and in the
 * conversation of the record keyed `recordKey`, and `elsewhere` when it is another conversation's, such as from an
 * address of another one.
 */
export const useThreadHead = (page: ConversationPageModel, model: ResourceModel, recordKey: string, first: string) => {
  const { resources, views } = useAdminMeta()
  const head = useRecord(page.resource, keyValue(model, first))
  const read = head.data?.record
  const senders = [page.sender]
  const sender = model.fields[page.sender]
  const named = page.sender in listLabels(resources, views, model, senders) && sender?.relation ? resources[sender.relation.resource] : undefined
  const ids = named && read?.[page.sender] != null ? [String(read[page.sender])] : []
  const labels = usePickedLabels(named ?? model, named && views[named.name], ids)
  const elsewhere = read !== undefined && !inConversation(read, page.field, recordKey)
  const [row] = read && !elsewhere ? withLabels(resources, model, senders, [read], { [page.sender]: Object.fromEntries(labels) }) : []
  return { row, elsewhere, error: head.error }
}
