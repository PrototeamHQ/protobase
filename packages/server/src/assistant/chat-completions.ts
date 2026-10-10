import { readEventStream } from '@protobase/schema'
import type { ModelSettings } from './assistant-settings'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

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

const send = (settings: ModelSettings, messages: ChatMessage[], signal?: AbortSignal) => {
  const doFetch = settings.fetch ?? fetch
  return doFetch(`${settings.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({ model: settings.model, messages, stream: true }),
    signal,
  }).catch((error: unknown) => {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ModelError(`Could not reach the model endpoint ${settings.baseUrl}`, { cause: error })
  })
}

type Chunk = { choices?: Array<{ delta?: { content?: string | null } }>; error?: { message?: string } }

/**
 * Streams a chat completion from an OpenAI-compatible endpoint (`POST <baseUrl>/chat/completions` with `stream: true`),
 * calling `onText` with each piece of the answer. Resolves with the whole answer; rejects with a `ModelError`.
 */
export const streamChatCompletion = async (settings: ModelSettings, messages: ChatMessage[], onText: (text: string) => void, signal?: AbortSignal) => {
  const response = await send(settings, messages, signal)
  if (!response.ok) throw await refusal(response, settings)
  if (!response.body) throw new ModelError(`The model endpoint ${settings.baseUrl} answered without a body`)
  let answer = ''
  await readEventStream(response.body, (data) => {
    if (data === '[DONE]') return
    const chunk = JSON.parse(data) as Chunk
    if (chunk.error) throw new ModelError(`The model endpoint ${settings.baseUrl} stopped: ${chunk.error.message ?? 'unknown error'}`)
    const text = chunk.choices?.[0]?.delta?.content
    if (!text) return
    answer += text
    onText(text)
  })
  return answer
}
