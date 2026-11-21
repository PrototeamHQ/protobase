import type { ConversationPageModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { recordKey as keyOf } from '../../live/model-helpers'
import { useToast } from '../../toasts/toast-provider'
import { keyValue } from '../create/create-values'
import { refusalReason } from '../displays/board-columns'
import { useAdminMeta } from '../meta-gate'
import { useRefreshResource } from '../pages/use-layout-data'
import { text } from './messages'

/**
 * The writes a reader makes to a conversation's messages, each resolving whether the server took it: edit a message's
 * text and mentions, delete one, and react to one or take a reaction back. A refused write changes nothing on screen
 * and shows the server's reason in a toast; a taken one reads the resource again.
 */
export const useMessageWrites = (page: ConversationPageModel) => {
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const { resources } = useAdminMeta()
  const model = resources[page.resource]!
  const reactions = page.reactions

  const run = (resource: string, failed: string, write: () => Promise<unknown>) =>
    write().then(
      () => {
        void refresh(resource)
        return true
      },
      (error: unknown) => {
        toast.show({ state: 'error', title: failed, description: refusalReason(error) })
        return false
      },
    )

  const edit = (key: string, body: string, mentions: string[]) =>
    run(page.resource, text('notSaved'), () => client.update(page.resource, key, { [page.text]: body, ...(page.mentions !== undefined && { [page.mentions]: mentions }) }, '*'))
  const remove = (key: string) => run(page.resource, text('notDeleted'), () => client.remove(page.resource, key))
  const react = reactions && ((key: string, emoji: string) => run(reactions.resource, text('reactionNotSaved'), () => client.create(reactions.resource, { [reactions.field]: keyValue(model, key), [reactions.emoji]: emoji })))
  const unreact = reactions && ((row: Record<string, unknown>) => run(reactions.resource, text('reactionNotSaved'), () => client.remove(reactions.resource, keyOf(resources[reactions.resource]!, row))))
  return { edit, remove, react, unreact }
}
