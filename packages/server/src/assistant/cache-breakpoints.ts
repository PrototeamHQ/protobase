import type { ChatMessage, ChatTextPart } from './chat-completions'

const breakpoint = { type: 'ephemeral' } as const

const marked = (message: ChatMessage): ChatMessage => {
  if (!message.content) return message
  const parts: ChatTextPart[] = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content
  const content = parts.map((part, index) => (index === parts.length - 1 ? { ...part, cache_control: breakpoint } : part))
  return { ...message, content }
}

/**
 * The messages with a prompt-cache breakpoint (`cache_control`, as OpenRouter and Anthropic read it) at the end of each
 * message at `indexes`: the endpoint caches everything up to it, tools included. A message without text, such as an
 * assistant message of only tool calls, gets none.
 */
export const withCacheBreakpoints = (messages: ChatMessage[], indexes: number[]) => messages.map((message, index) => (indexes.includes(index) ? marked(message) : message))
