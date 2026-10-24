import type { PushAnswer } from '../sender'

export type PushResult = Omit<PushAnswer, 'id'>

export type PostOptions = { fetch?: typeof fetch; timeoutMs?: number }

/** How long a push service has to answer before the device is answered `retry`. */
export const defaultPushTimeoutMs = 10_000

const retryAfter = (response: Response): PushResult => {
  const seconds = response.headers.get('retry-after')?.trim()
  return seconds !== undefined && /^\d{1,7}$/.test(seconds) ? { result: 'retry', retryAfterSeconds: Number(seconds) } : { result: 'retry' }
}

/**
 * What a push service's status means for the device: any 2xx took it; 404 and 410 say the subscription is gone; every
 * other status, a redirect, a 429 or 5xx, and a 4xx that may be a configuration mistake (a wrong key), asks to try
 * again, so no mistake of ours removes devices.
 */
export const pushResult = (response: Response): PushResult => {
  if (response.status >= 200 && response.status < 300) return { result: 'ok' }
  if (response.status === 404 || response.status === 410) return { result: 'gone' }
  return retryAfter(response)
}

// The errors fetch rejects with when the request does not get an answer: a refused or reset connection or a
// certificate that does not verify (a TypeError on Bun and on Node), and the timeout.
const isTransient = (error: unknown) => error instanceof TypeError || (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError'))

/**
 * Posts one Web Push request and answers what it means for the device. Redirects are never followed, so the request
 * and its token reach only `url`, and an answer that does not come within the timeout is `retry`. Fetch's own errors
 * are never passed on, since they can name the URL: one that is not a missing answer becomes an error of its own.
 */
export const postPush = async (url: URL, headers: Record<string, string>, body: Uint8Array<ArrayBuffer>, options: PostOptions = {}): Promise<PushResult> => {
  const request = new Request(url, { method: 'POST', headers, body, redirect: 'manual' })
  const signal = AbortSignal.timeout(options.timeoutMs ?? defaultPushTimeoutMs)
  const send = options.fetch ?? fetch
  let response: Response
  try {
    response = await send(request, { signal })
  } catch (error) {
    if (isTransient(error)) return { result: 'retry' }
    throw new Error('A Web Push request failed unexpectedly')
  }
  await response.body?.cancel()
  return pushResult(response)
}
