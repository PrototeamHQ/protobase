import type { AssistantEvent, AssistantMessage, AssistantPart, AssistantState } from './protocol'

export const emptyAssistantState: AssistantState = { messages: [], replying: false }

const upsert = <T extends { id: string }>(items: T[], item: T) => {
  const index = items.findIndex((entry) => entry.id === item.id)
  return index === -1 ? [...items, item] : items.map((entry, at) => (at === index ? item : entry))
}

const withPart = (messages: AssistantMessage[], messageId: string, part: AssistantPart) => {
  const message = messages.find((entry) => entry.id === messageId)
  const next: AssistantMessage = message ? { ...message, parts: upsert(message.parts, part) } : { id: messageId, from: 'assistant', parts: [part] }
  return upsert(messages, next)
}

/** The state after one event; a `part` for a message not seen yet starts an assistant message. */
export const applyAssistantEvent = (state: AssistantState, event: AssistantEvent): AssistantState => {
  switch (event.type) {
    case 'state':
      return event.state
    case 'message':
      return { ...state, messages: upsert(state.messages, event.message) }
    case 'part':
      return { ...state, messages: withPart(state.messages, event.messageId, event.part) }
    case 'patch': {
      const { replying = state.replying, status = state.status, placeholder = state.placeholder } = event
      return { messages: state.messages, replying, ...(status !== null && status !== undefined && { status }), ...(placeholder !== null && placeholder !== undefined && { placeholder }) }
    }
  }
}
