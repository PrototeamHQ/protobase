import { retryAfter, type PushResult } from '../web-push/post'
import { relaySendAnswer } from './relay-protocol'

const parsedJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return
    throw error
  }
}

/**
 * What the relay's answer to a send means for each handle sent: a 2xx answers each by its result, and a handle it does
 * not answer, or an answer that is not a send answer, is `retry`. Every other status is `retry` for all, after its
 * Retry-After when it gives one: a 429 or 5xx, and a 401, 403 or other 4xx that may be a configuration mistake, such as
 * a wrong credential, so no mistake of ours removes devices.
 */
export const relayAnswer = (response: Response, text: string, handles: readonly string[]): Map<string, PushResult> => {
  const all = (result: PushResult) => new Map(handles.map((handle) => [handle, result]))
  if (response.status < 200 || response.status >= 300) return all(retryAfter(response))
  const parsed = relaySendAnswer.safeParse(parsedJson(text))
  if (!parsed.success) return all({ result: 'retry' })
  const sent = new Set(handles)
  const answered = new Map(parsed.data.results.filter(({ handle }) => sent.has(handle)).map(({ handle, result }) => [handle, { result }]))
  return new Map(handles.map((handle) => [handle, answered.get(handle) ?? { result: 'retry' }]))
}
