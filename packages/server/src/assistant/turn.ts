import type { AssistantPart } from '@protobase/schema'
import type { Session } from '../types'
import { requestApproval } from './approval'
import type { ModelSettings } from './assistant-settings'
import { ModelError, streamChatCompletion, type ChatMessage, type ToolCall } from './chat-completions'
import type { Conversation } from './conversations'
import type { AssistantTool, ToolContext } from './tools'

export type TurnOptions = {
  model: ModelSettings
  conversation: Conversation
  session: Session
  /** The system prompt. */
  system: string
  tools?: AssistantTool[]
  /** Model calls in one turn before it stops. Default 8. */
  maxSteps?: number
  /** Gets errors other than the model endpoint's refusals, which the user only sees as a failure. */
  report?: (error: unknown) => void
  /** Transcript messages kept for the next turns. Default 40. */
  keep?: number
}

const toolResult = async (call: ToolCall, tools: AssistantTool[], context: ToolContext) => {
  const tool = tools.find((entry) => entry.name === call.function.name)
  if (!tool) return `There is no tool named "${call.function.name}".`
  const args: unknown = call.function.arguments ? JSON.parse(call.function.arguments) : {}
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return 'The arguments must be a JSON object.'
  return tool.run(args as Record<string, unknown>, context)
}

// Older messages leave the transcript a whole user turn at a time, so tool calls keep their results.
const trimmed = (transcript: ChatMessage[], keep: number) => {
  if (transcript.length <= keep) return transcript
  const start = transcript.findIndex((message, index) => index >= transcript.length - keep && message.role === 'user')
  return start === -1 ? transcript.slice(-1) : transcript.slice(start)
}

const failure = (error: unknown, report?: (error: unknown) => void) => {
  if (error instanceof ModelError) return error.message
  if (error instanceof SyntaxError) return 'The model answered with JSON that could not be read.'
  report?.(error)
  return 'The server failed to answer.'
}

/**
 * One turn of the chat: adds the user's message, then calls the model with the transcript and the tools, runs the
 * tools it calls and calls it again with their results, until it answers without a tool call. Its text streams into
 * one assistant message, beside the parts tools show; a failure ends the turn with a danger card.
 */
export const runTurn = async (options: TurnOptions, text: string) => {
  const { model, conversation, session, system, tools = [], maxSteps = 8 } = options
  const messageId = crypto.randomUUID()
  const show = (part: AssistantPart) => conversation.apply({ type: 'part', messageId, part })
  const context: ToolContext = { session, conversation, show, approve: (request) => requestApproval(conversation, messageId, request) }
  const specs = tools.map((tool) => ({ type: 'function' as const, function: { name: tool.name, description: tool.description, parameters: tool.parameters } }))

  conversation.apply({ type: 'message', message: { id: crypto.randomUUID(), from: 'user', parts: [{ type: 'text', id: crypto.randomUUID(), text }] } })
  conversation.apply({ type: 'patch', replying: true })
  conversation.transcript = trimmed([...conversation.transcript, { role: 'user', content: text }], options.keep ?? 40)
  const before = conversation.transcript.length

  const steps = async () => {
    for (let step = 0; step < maxSteps; step++) {
      const part = { type: 'text' as const, id: `${messageId}-${step}`, text: '' }
      const { content, toolCalls } = await streamChatCompletion(model, [{ role: 'system', content: system }, ...conversation.transcript], (piece) => {
        part.text += piece
        show({ ...part })
      }, { tools: specs })
      conversation.transcript.push({ role: 'assistant', content: content || null, ...(toolCalls.length > 0 && { tool_calls: toolCalls }) })
      if (toolCalls.length === 0) return
      for (const call of toolCalls) conversation.transcript.push({ role: 'tool', tool_call_id: call.id, content: await toolResult(call, tools, context) })
    }
    show({ type: 'text', id: `${messageId}-stopped`, text: `Stopped after ${maxSteps} steps.` })
  }

  await steps()
    .catch((error: unknown) => {
      // A turn that failed halfway leaves only the user's message, so the next turn starts from a valid transcript.
      conversation.transcript.splice(before)
      show({ type: 'card', id: `${messageId}-error`, title: 'The assistant could not answer', tone: 'danger', body: failure(error, options.report) })
    })
    .finally(() => conversation.apply({ type: 'patch', replying: false }))
}
