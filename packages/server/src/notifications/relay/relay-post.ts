import { isTransient } from '../fcm/fcm-post'
import { defaultPushTimeoutMs, type PushResult } from '../web-push/post'
import { relayAnswer } from './relay-answer'
import type { RelaySendRequest } from './relay-protocol'

export type RelayPostOptions = { fetch?: typeof fetch; timeoutMs?: number }

/**
 * Posts one send request to the relay with the credential as its bearer, and answers what it means for each handle, as
 * `relayAnswer` says. Redirects are never followed, so the request and its credential reach only `url`, and an answer
 * that does not come within the timeout is `retry` for every handle. Fetch's own errors are never passed on: one that
 * is not a missing answer becomes an error of its own.
 */
export const postRelay = async (url: URL, credential: string, body: RelaySendRequest, options: RelayPostOptions = {}): Promise<Map<string, PushResult>> => {
  const handles = body.devices.map((device) => device.handle)
  const headers = { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }
  const request = new Request(url, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'manual' })
  const send = options.fetch ?? fetch
  try {
    const response = await send(request, { signal: AbortSignal.timeout(options.timeoutMs ?? defaultPushTimeoutMs) })
    return relayAnswer(response, await response.text(), handles)
  } catch (error) {
    if (isTransient(error)) return new Map(handles.map((handle) => [handle, { result: 'retry' }]))
    throw new Error('A push relay request failed unexpectedly')
  }
}
