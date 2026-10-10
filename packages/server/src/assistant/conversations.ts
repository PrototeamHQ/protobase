import { applyAssistantEvent, emptyAssistantState, type AssistantEvent, type AssistantState } from '@protobase/schema'

export type Conversation = {
  state: () => AssistantState
  apply: (event: AssistantEvent) => void
  /** Calls `listener` with every later event until the returned function is called. */
  subscribe: (listener: (event: AssistantEvent) => void) => () => void
}

const createConversation = (keep: number): Conversation => {
  let state = emptyAssistantState
  const listeners = new Set<(event: AssistantEvent) => void>()
  return {
    state: () => state,
    apply: (event) => {
      const next = applyAssistantEvent(state, event)
      state = next.messages.length > keep ? { ...next, messages: next.messages.slice(-keep) } : next
      for (const listener of listeners) listener(event)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/**
 * Each user's chat with the built-in assistant, in this process's memory: shared by their open tabs, gone on a
 * restart, and cut to the last `keep` messages.
 */
export const createConversations = (keep = 50) => {
  const byUser = new Map<string, Conversation>()
  return (userKey: string) => {
    const existing = byUser.get(userKey)
    if (existing) return existing
    const conversation = createConversation(keep)
    byUser.set(userKey, conversation)
    return conversation
  }
}
