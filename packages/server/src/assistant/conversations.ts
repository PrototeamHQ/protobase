import { applyAssistantEvent, emptyAssistantState, type AssistantEvent, type AssistantState } from '@protobase/schema'
import type { Session } from '../types'
import type { ChatMessage } from './chat-completions'
import type { ConversationRecord, ConversationStore } from './conversation-store'

export type Conversation = {
  state: () => AssistantState
  apply: (event: AssistantEvent) => void
  /** Calls `listener` with every later event until the returned function is called. */
  subscribe: (listener: (event: AssistantEvent) => void) => () => void
  /** The chat as the model read it, tool calls and their results included, oldest first. */
  transcript: () => readonly ChatMessage[]
  /** Adds messages to the transcript, as they were sent to the model or came from it. */
  remember: (...messages: ChatMessage[]) => void
  /** Appends what changed since the last save to the store: the chat's changed messages and the transcript's new ones. */
  save: () => Promise<void>
  /** Calls `handler` with the action's id when a button of part `partId` is clicked, until the returned function is called. */
  onAction: (partId: string, handler: (actionId: string) => void) => () => void
  /** Hands a click to the part's handler; false when no handler waits for that part. */
  act: (partId: string, actionId: string) => boolean
}

export type ConversationsOptions = {
  /** Where conversations are kept; without one they live in this process's memory only. */
  store?: ConversationStore
  /** Chat messages the user sees. Default 50. */
  keepMessages?: number
  /**
   * Transcript messages the model reads. Past it, the transcript drops its older half at the next user message, so
   * the prefix a model endpoint caches stays the same for many turns. Default 40.
   */
  keepTranscript?: number
}

// Older messages leave the transcript a whole user turn at a time, so tool calls keep their results.
const remembered = (transcript: ChatMessage[], message: ChatMessage, keep: number) => {
  const next = [...transcript, message]
  if (message.role !== 'user' || next.length <= keep) return next
  return next.slice(next.findIndex((entry, index) => index >= next.length - keep / 2 && entry.role === 'user'))
}

const createConversation = (records: ConversationRecord[], keepMessages: number, keepTranscript: number, write: (records: ConversationRecord[]) => Promise<void>): Conversation => {
  let state = emptyAssistantState
  let transcript: ChatMessage[] = []
  const listeners = new Set<(event: AssistantEvent) => void>()
  const actions = new Map<string, (actionId: string) => void>()
  // What the next save appends: the ids of changed messages (all of them after a `state` event) and new transcript.
  let replaced = false
  const changed = new Set<string>()
  let unsaved: ChatMessage[] = []
  let saving = Promise.resolve()

  const fold = (event: AssistantEvent) => {
    const next = applyAssistantEvent(state, event)
    state = next.messages.length > keepMessages ? { ...next, messages: next.messages.slice(-keepMessages) } : next
  }
  const remember = (message: ChatMessage) => {
    transcript = remembered(transcript, message, keepTranscript)
  }

  for (const record of records) {
    if (record.type === 'transcript') remember(record.message)
    else fold(record)
  }
  state = { ...state, replying: false }

  const pending = (): ConversationRecord[] => {
    const messages: ConversationRecord[] = replaced
      ? [{ type: 'state', state: { messages: state.messages, replying: false } }]
      : state.messages.filter((message) => changed.has(message.id)).map((message) => ({ type: 'message', message }))
    const records = [...messages, ...unsaved.map((message) => ({ type: 'transcript' as const, message }))]
    replaced = false
    changed.clear()
    unsaved = []
    return records
  }

  return {
    state: () => state,
    apply: (event) => {
      fold(event)
      if (event.type === 'state') replaced = true
      if (event.type === 'message') changed.add(event.message.id)
      if (event.type === 'part') changed.add(event.messageId)
      for (const listener of listeners) listener(event)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    transcript: () => transcript,
    remember: (...messages) => {
      for (const message of messages) remember(message)
      unsaved.push(...messages)
    },
    save: () => {
      const records = pending()
      // Saves append in order; a failed one was its caller's to handle, so the next still runs.
      const next = () => (records.length > 0 ? write(records) : Promise.resolve())
      saving = saving.then(next, next)
      return saving
    },
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

/** The owner of a user's conversations, per tenant. */
export const conversationKey = (session: Session) => JSON.stringify([session.tenant ?? null, session.user.id])

/**
 * Conversations by owner (see `conversationKey`) and id, each loaded from the store on first use and then kept in this
 * process's memory, shared by the owner's open tabs. A deployment of several instances needs each owner's requests on
 * one instance, since a turn and its approvals run in the instance that started it.
 */
export const createConversations = ({ store, keepMessages = 50, keepTranscript = 40 }: ConversationsOptions = {}) => {
  const loaded = new Map<string, Promise<Conversation>>()
  return (owner: string, id = 'chat') => {
    const key = JSON.stringify([owner, id])
    const existing = loaded.get(key)
    if (existing) return existing
    const write = (records: ConversationRecord[]) => store?.append(owner, id, records) ?? Promise.resolve()
    const conversation = (store?.load(owner, id) ?? Promise.resolve([])).then((records) => createConversation(records, keepMessages, keepTranscript, write))
    // A load that failed is tried again by the next request.
    conversation.catch(() => loaded.delete(key))
    loaded.set(key, conversation)
    return conversation
  }
}
