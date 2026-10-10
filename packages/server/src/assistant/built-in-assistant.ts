import type { AssistantMessage, AssistantState } from '@protobase/schema'
import type { ModelSettings } from './assistant-settings'
import { ModelError, streamChatCompletion, type ChatMessage } from './chat-completions'
import type { Conversation } from './conversations'

const textOf = (message: AssistantMessage) => message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n')

// The chat so far as the model reads it: user questions and the assistant's text answers, cards left out.
const history = (state: AssistantState): ChatMessage[] =>
  state.messages.flatMap((message) => {
    const content = textOf(message)
    return content ? [{ role: message.from, content }] : []
  })

// A model endpoint's refusal is the admin's to fix, so the card says it; anything else goes to the host's error report.
const failure = (error: unknown, report?: (error: unknown) => void) => {
  if (error instanceof ModelError) return error.message
  report?.(error)
  return 'The server failed to answer.'
}

/**
 * Answers the user's last question in `conversation`: streams the model's answer into a new assistant message, and
 * replaces it with a danger card when that fails. `context` is the system prompt.
 */
export const answer = async (model: ModelSettings, conversation: Conversation, context: ChatMessage, report?: (error: unknown) => void) => {
  const id = crypto.randomUUID()
  const part = { type: 'text' as const, id: `${id}-text`, text: '' }
  conversation.apply({ type: 'message', message: { id, from: 'assistant', parts: [part] } })
  const messages = [context, ...history(conversation.state())]
  await streamChatCompletion(model, messages, (text) => {
    part.text += text
    conversation.apply({ type: 'part', messageId: id, part: { ...part } })
  })
    .catch((error: unknown) => {
      const body = failure(error, report)
      conversation.apply({ type: 'message', message: { id, from: 'assistant', parts: [{ type: 'card', id: `${id}-error`, title: 'The assistant could not answer', tone: 'danger', body }] } })
    })
    .finally(() => conversation.apply({ type: 'patch', replying: false }))
}

/** Adds the user's question to the chat and starts the answer, which arrives as events. */
export const ask = (model: ModelSettings, conversation: Conversation, text: string, context: ChatMessage, report?: (error: unknown) => void) => {
  conversation.apply({ type: 'message', message: { id: crypto.randomUUID(), from: 'user', parts: [{ type: 'text', id: crypto.randomUUID(), text }] } })
  conversation.apply({ type: 'patch', replying: true })
  return answer(model, conversation, context, report)
}
