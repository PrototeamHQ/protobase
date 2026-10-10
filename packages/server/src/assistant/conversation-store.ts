import type { AssistantEvent } from '@protobase/schema'
import type { ChatMessage } from './chat-completions'

/**
 * What a conversation keeps, appended in order: the chat the user sees as `state` and `message` events, and the
 * transcript the model read, one `transcript` record per message, exactly as it was sent.
 */
export type ConversationRecord = Extract<AssistantEvent, { type: 'state' | 'message' }> | { type: 'transcript'; message: ChatMessage }

/**
 * Where conversations live between requests and restarts, by owner (one user, see `conversationKey`) and id. The
 * built-in assistant keeps them in files (`fileConversationStore`); a hosted backend can keep them in its database.
 */
export type ConversationStore = {
  /** The conversation's records in the order they were appended; none for a conversation not started. */
  load: (owner: string, id: string) => Promise<ConversationRecord[]>
  append: (owner: string, id: string, records: ConversationRecord[]) => Promise<void>
  /** The owner's conversations, the latest changed first. */
  list: (owner: string) => Promise<Array<{ id: string; updatedAt: Date }>>
}
