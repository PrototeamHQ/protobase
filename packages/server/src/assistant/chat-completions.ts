import { readEventStream } from '@protobase/schema'
import type { ModelSettings } from './assistant-settings'

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }

/** A message of a chat completion: what the model reads, and the tool calls it made with their results. */
export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

/** A tool as the endpoint's `tools` field describes it: a function with JSON Schema parameters. */
export type ToolSpec = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }

export type Completion = { content: string; toolCalls: ToolCall[] }

/** A failed call to the model endpoint, with a message an admin can act on. */
export class ModelError extends Error {
  override name = 'ModelError'
}

type ErrorBody = { error?: { message?: unknown } | string; message?: unknown }

const errorText = async (response: Response) => {
  const text = await response.text()
  if (!text) return undefined
  if (!response.headers.get('content-type')?.includes('json')) return text.slice(0, 300)
  const body = JSON.parse(text) as ErrorBody
  const message = typeof body.error === 'string' ? body.error : (body.error?.message ?? body.message)
  return typeof message === 'string' ? message : undefined
}

const statusHints: Record<number, string> = {
  401: 'check the API key',
  402: 'the account behind the API key is out of credit',
  403: 'the API key may not use this model',
  404: 'check the base URL and the model',
  429: 'the endpoint is rate limiting; try again shortly',
}

const refusal = async (response: Response, settings: ModelSettings) => {
  const detail = await errorText(response)
  const hint = statusHints[response.status]
  return new ModelError(`The model endpoint ${settings.baseUrl} answered ${response.status}${detail ? `: ${detail}` : ''}${hint ? ` (${hint})` : ''}`)
}

const send = (settings: ModelSettings, messages: ChatMessage[], tools: ToolSpec[], signal?: AbortSignal) => {
  const doFetch = settings.fetch ?? fetch
  return doFetch(`${settings.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({ model: settings.model, messages, stream: true, ...(tools.length > 0 && { tools }) }),
    signal,
  }).catch((error: unknown) => {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ModelError(`Could not reach the model endpoint ${settings.baseUrl}`, { cause: error })
  })
}

type ToolCallDelta = { index: number; id?: string; function?: { name?: string; arguments?: string } }
type Chunk = { choices?: Array<{ delta?: { content?: string | null; tool_calls?: ToolCallDelta[] } }>; error?: { message?: string } }

// Tool calls arrive in pieces by index: the id and name first, the arguments as fragments of JSON.
const addToolCall = (calls: ToolCall[], delta: ToolCallDelta) => {
  const call = (calls[delta.index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } })
  if (delta.id) call.id = delta.id
  if (delta.function?.name) call.function.name += delta.function.name
  if (delta.function?.arguments) call.function.arguments += delta.function.arguments
}

/**
 * Streams a chat completion from an OpenAI-compatible endpoint (`POST <baseUrl>/chat/completions` with `stream: true`),
 * offering `tools` and calling `onText` with each piece of the answer. Resolves with the whole answer and the tool
 * calls the model made; rejects with a `ModelError`.
 */
export const streamChatCompletion = async (settings: ModelSettings, messages: ChatMessage[], onText: (text: string) => void, options: { tools?: ToolSpec[]; signal?: AbortSignal } = {}): Promise<Completion> => {
  const response = await send(settings, messages, options.tools ?? [], options.signal)
  if (!response.ok) throw await refusal(response, settings)
  if (!response.body) throw new ModelError(`The model endpoint ${settings.baseUrl} answered without a body`)
  let content = ''
  const toolCalls: ToolCall[] = []
  await readEventStream(response.body, (data) => {
    if (data === '[DONE]') return
    const chunk = JSON.parse(data) as Chunk
    if (chunk.error) throw new ModelError(`The model endpoint ${settings.baseUrl} stopped: ${chunk.error.message ?? 'unknown error'}`)
    const delta = chunk.choices?.[0]?.delta
    for (const call of delta?.tool_calls ?? []) addToolCall(toolCalls, call)
    if (!delta?.content) return
    content += delta.content
    onText(delta.content)
  })
  return { content, toolCalls: toolCalls.filter(Boolean) }
}
