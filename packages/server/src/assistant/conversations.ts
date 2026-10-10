import { applyAssistantEvent, emptyAssistantState, type AssistantEvent, type AssistantState } from '@protobase/schema'
import type { Session } from '../types'
import type { ChatMessage } from './chat-completions'

export type Conversation = {
  state: () => AssistantState
  apply: (event: AssistantEvent) => void
  /** Calls `listener` with every later event until the returned function is called. */
  subscribe: (listener: (event: AssistantEvent) => void) => () => void
  /** The chat as the model reads it, tool calls and their results included; turns add to it. */
  transcript: ChatMessage[]
  /** Calls `handler` with the action's id when a button of part `partId` is clicked, until the returned function is called. */
  onAction: (partId: string, handler: (actionId: string) => void) => () => void
  /** Hands a click to the part's handler; false when no handler waits for that part. */
  act: (partId: string, actionId: string) => boolean
}

const createConversation = (keep: number): Conversation => {
  let state = emptyAssistantState
  const listeners = new Set<(event: AssistantEvent) => void>()
  const actions = new Map<string, (actionId: string) => void>()
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
    transcript: [],
    onAction: (partId, handler) => {
      actions.set(partId, handler)
      return () => actions.delete(partId)
    },
    act: (partId, actionId) => {
      const handler = actions.get(partId)
      handler?.(actionId)
      return handler !== undefined
    },
  }
}

/** One conversation per user and tenant. */
export const conversationKey = (session: Session) => JSON.stringify([session.tenant ?? null, session.user.id])

/**
 * Conversations in this process's memory, by key (see `conversationKey`): shared by a user's open tabs, gone on a
 * restart, each cut to its last `keep` messages.
 */
export const createConversations = (keep = 50) => {
  const byKey = new Map<string, Conversation>()
  return (key: string) => {
    const existing = byKey.get(key)
    if (existing) return existing
    const conversation = createConversation(keep)
    byKey.set(key, conversation)
    return conversation
  }
}
