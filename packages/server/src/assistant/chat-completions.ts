import { readEventStream } from '@protobase/schema'

/** An OpenAI-compatible chat completions endpoint for the built-in assistant. */
export type ModelSettings = { baseUrl: string; apiKey: string; model: string; fetch?: typeof fetch }

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }

/** A piece of a message's text; `cache_control` marks a prompt-cache breakpoint after it (OpenRouter, Anthropic). */
export type ChatTextPart = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }

/**
 * A message of a chat completion: what the model reads, and the tool calls it made with their results. An assistant
 * message keeps the model's `reasoning_details` (OpenRouter), which a reasoning model needs back with its tool calls.
 */
export type ChatMessage =
  | { role: 'system' | 'user'; content: string | ChatTextPart[] }
  | { role: 'assistant'; content: string | ChatTextPart[] | null; tool_calls?: ToolCall[]; reasoning_details?: ReasoningDetail[] }
  | { role: 'tool'; tool_call_id: string; content: string | ChatTextPart[] }

/** One block of a model's reasoning, as OpenRouter streams it: passed back unchanged, never shown. */
export type ReasoningDetail = { type: string; index?: number; [field: string]: unknown }

/** How much a reasoning model thinks before it answers, as OpenRouter's `reasoning.effort`. */
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** A tool as the endpoint's `tools` field describes it: a function with JSON Schema parameters. */
export type ToolSpec = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }

export type Completion = { content: string; toolCalls: ToolCall[]; reasoningDetails: ReasoningDetail[] }

export type CompletionOptions = { tools?: ToolSpec[]; reasoning?: ReasoningEffort; signal?: AbortSignal }

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

const send = (settings: ModelSettings, messages: ChatMessage[], { tools = [], reasoning, signal }: CompletionOptions) => {
  const doFetch = settings.fetch ?? fetch
  return doFetch(`${settings.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({ model: settings.model, messages, stream: true, ...(tools.length > 0 && { tools }), ...(reasoning && { reasoning: { effort: reasoning } }) }),
    signal,
  }).catch((error: unknown) => {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ModelError(`Could not reach the model endpoint ${settings.baseUrl}`, { cause: error })
  })
}

type ToolCallDelta = { index: number; id?: string; function?: { name?: string; arguments?: string } }
type Chunk = { choices?: Array<{ delta?: { content?: string | null; tool_calls?: ToolCallDelta[]; reasoning_details?: ReasoningDetail[] } }>; error?: { message?: string } }

// Tool calls arrive in pieces by index: the id and name first, the arguments as fragments of JSON.
const addToolCall = (calls: ToolCall[], delta: ToolCallDelta) => {
  const call = (calls[delta.index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } })
  if (delta.id) call.id = delta.id
  if (delta.function?.name) call.function.name += delta.function.name
  if (delta.function?.arguments) call.function.arguments += delta.function.arguments
}

// Reasoning arrives in pieces by index too: text, summary and data grow, the other fields (signature, id) are set.
const addReasoning = (details: ReasoningDetail[], piece: ReasoningDetail) => {
  const at = piece.index ?? details.length
  const detail = details[at]
  if (!detail) {
    details[at] = { ...piece }
    return
  }
  for (const [field, value] of Object.entries(piece)) {
    const grows = (field === 'text' || field === 'summary' || field === 'data') && typeof value === 'string' && typeof detail[field] === 'string'
    detail[field] = grows ? `${String(detail[field])}${value}` : value
  }
}

/**
 * Streams a chat completion from an OpenAI-compatible endpoint (`POST <baseUrl>/chat/completions` with `stream: true`),
 * offering `tools` and calling `onText` with each piece of the answer. `reasoning` sets OpenRouter's reasoning effort,
 * which other endpoints may refuse. Resolves with the whole answer, the tool calls the model made and its reasoning
 * details; rejects with a `ModelError`.
 */
export const streamChatCompletion = async (settings: ModelSettings, messages: ChatMessage[], onText: (text: string) => void, options: CompletionOptions = {}): Promise<Completion> => {
  const response = await send(settings, messages, options)
  if (!response.ok) throw await refusal(response, settings)
  if (!response.body) throw new ModelError(`The model endpoint ${settings.baseUrl} answered without a body`)
  let content = ''
  const toolCalls: ToolCall[] = []
  const reasoningDetails: ReasoningDetail[] = []
  await readEventStream(response.body, (data) => {
    if (data === '[DONE]') return
    const chunk = JSON.parse(data) as Chunk
    if (chunk.error) throw new ModelError(`The model endpoint ${settings.baseUrl} stopped: ${chunk.error.message ?? 'unknown error'}`)
    const delta = chunk.choices?.[0]?.delta
    for (const call of delta?.tool_calls ?? []) addToolCall(toolCalls, call)
    for (const piece of delta?.reasoning_details ?? []) addReasoning(reasoningDetails, piece)
    if (!delta?.content) return
    content += delta.content
    onText(delta.content)
  })
  return { content, toolCalls: toolCalls.filter(Boolean), reasoningDetails: reasoningDetails.filter(Boolean) }
}
