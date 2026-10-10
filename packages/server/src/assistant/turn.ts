import type { AssistantPart } from '@protobase/schema'
import type { Session } from '../types'
import { requestApproval } from './approval'
import { withCacheBreakpoints } from './cache-breakpoints'
import { ModelError, streamChatCompletion, type ChatMessage, type ModelSettings, type ReasoningEffort, type ToolCall } from './chat-completions'
import type { Conversation } from './conversations'
import { noRecords, type ToolRecords } from './records'
import type { AssistantTool, ToolContext } from './tools'

export type TurnOptions = {
  model: ModelSettings
  conversation: Conversation
  session: Session
  /** The system prompt. */
  system: string
  tools?: AssistantTool[]
  /** What tools get as `records`; without it, their calls fail. */
  records?: ToolRecords
  /** Model calls in one turn before it stops. Default 8. */
  maxSteps?: number
  /** Gets errors other than the model endpoint's refusals, which the user only sees as a failure. */
  report?: (error: unknown) => void
  /** Text the model reads before the user's message, such as the page they are on; the transcript keeps it with the message. */
  context?: string
  /** How much a reasoning model thinks before it answers (OpenRouter's `reasoning.effort`); the model's default without it. */
  reasoning?: ReasoningEffort
  /**
   * Marks prompt-cache breakpoints (`cache_control`) on the system prompt, the transcript before this turn and the
   * latest message, so an endpoint that caches on them (OpenRouter, Anthropic) bills the repeated prefix as a cache read.
   * Off by default: an endpoint that does not know the field may refuse it.
   */
  cache?: boolean
}

const toolResult = async (call: ToolCall, tools: AssistantTool[], context: ToolContext) => {
  const tool = tools.find((entry) => entry.name === call.function.name)
  if (!tool) return `There is no tool named "${call.function.name}".`
  const args: unknown = call.function.arguments ? JSON.parse(call.function.arguments) : {}
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return 'The arguments must be a JSON object.'
  return tool.run(args as Record<string, unknown>, context)
}

const failure = (error: unknown, report?: (error: unknown) => void) => {
  if (error instanceof ModelError) return error.message
  if (error instanceof SyntaxError) return 'The model answered with JSON that could not be read.'
  report?.(error)
  return 'The server failed to answer.'
}

// The request with breakpoints after the system prompt, after the transcript of earlier turns and after its last message.
const marked = (messages: ChatMessage[], before: number, cache: boolean) => (cache ? withCacheBreakpoints(messages, [0, before, messages.length - 1]) : messages)

/**
 * One turn of the chat: adds the user's message, then calls the model with the transcript and the tools, runs the
 * tools it calls and calls it again with their results, until it answers without a tool call. Its text streams into
 * one assistant message, beside the parts tools show; a failure ends the turn with a danger card. The transcript keeps
 * every message as the model read it, so the next turn's request starts with the same prefix; the turn ends by saving
 * the conversation.
 */
export const runTurn = async (options: TurnOptions, text: string) => {
  const { model, conversation, session, system, tools = [], maxSteps = 8, reasoning, cache = false } = options
  const messageId = crypto.randomUUID()
  const show = (part: AssistantPart) => conversation.apply({ type: 'part', messageId, part })
  const context: ToolContext = { session, conversation, show, approve: (request) => requestApproval(conversation, messageId, request), records: options.records ?? noRecords }
  const specs = tools.map((tool) => ({ type: 'function' as const, function: { name: tool.name, description: tool.description, parameters: tool.parameters } }))

  conversation.apply({ type: 'message', message: { id: crypto.randomUUID(), from: 'user', parts: [{ type: 'text', id: crypto.randomUUID(), text }] } })
  conversation.apply({ type: 'patch', replying: true })
  conversation.remember({ role: 'user', content: options.context ? `${options.context}\n\n${text}` : text })
  const earlier = [{ role: 'system' as const, content: system }, ...conversation.transcript()]
  // The turn's messages join the transcript only when it ends well, so a failed turn leaves a valid one.
  const added: ChatMessage[] = []

  const steps = async () => {
    for (let step = 0; step < maxSteps; step++) {
      const part = { type: 'text' as const, id: `${messageId}-${step}`, text: '' }
      const { content, toolCalls, reasoningDetails } = await streamChatCompletion(model, marked([...earlier, ...added], earlier.length - 2, cache), (piece) => {
        part.text += piece
        show({ ...part })
      }, { tools: specs, reasoning })
      added.push({ role: 'assistant', content: content || null, ...(toolCalls.length > 0 && { tool_calls: toolCalls }), ...(reasoningDetails.length > 0 && { reasoning_details: reasoningDetails }) })
      if (toolCalls.length === 0) return
      for (const call of toolCalls) added.push({ role: 'tool', tool_call_id: call.id, content: await toolResult(call, tools, context) })
    }
    show({ type: 'text', id: `${messageId}-stopped`, text: `Stopped after ${maxSteps} steps.` })
  }

  await steps().then(
    () => conversation.remember(...added),
    (error: unknown) => show({ type: 'card', id: `${messageId}-error`, title: 'The assistant could not answer', tone: 'danger', body: failure(error, options.report) }),
  )
  // Saved before the user may send the next message.
  await conversation.save().finally(() => conversation.apply({ type: 'patch', replying: false }))
}
