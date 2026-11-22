import { useRelayTyping } from '../../relay/use-relay-typing'
import { typingTransport } from '../../typing/conversation-typing'
import { useRecordTyping } from '../../typing/use-record-typing'
import { useAdminMeta } from '../meta-gate'

/**
 * A conversation page's `typing` (see `typingTransport`): over the realtime relay's channel of the record when the app
 * has a relay, else over the record's own channel, which only the transport chosen joins.
 */
export const useConversationTyping = (typing: boolean | undefined, resource: string, key: string, me: string | undefined) => {
  const transport = typingTransport(typing, Boolean(useAdminMeta().relay), me)
  const relay = useRelayTyping(transport === 'relay' ? `${resource}/${key}` : undefined)
  const record = useRecordTyping(transport === 'record' ? { resource, key } : undefined, me)
  return transport === 'relay' ? relay : record
}
