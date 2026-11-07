import { AddressRefusedError, pinnedRequest, type PinnedInit } from '../../webhooks/table/pinned-request'
import type { PushAnswer } from '../sender'

export type PushResult = Omit<PushAnswer, 'id'>

/** How a Web Push request is sent: `pinnedRequest` by default; tests give their own. */
export type PushRequest = (url: URL, init: PinnedInit) => Promise<Response>

export type PostOptions = { request?: PushRequest; timeoutMs?: number }

/** How long a push service has to answer before the device is answered `retry`. */
export const defaultPushTimeoutMs = 10_000

// Only ever to the address its host resolved to, checked to be public, as a webhook is sent.
const pinned: PushRequest = (url, init) => pinnedRequest(url.href, init)

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

// The codes Node's and Bun's sockets, resolver and TLS reject with when the request gets no answer: a host that does
// not resolve now, a refused, reset or unreachable connection, and a certificate that does not verify.
const transientCodes = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ABORT_ERR',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID',
])

// A missing answer: one of those codes, or the timeout's or an abort's error.
const isTransient = (error: unknown) => {
  if (!(error instanceof Error) && !(error instanceof DOMException)) return false
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && transientCodes.has(code)
}

/**
 * Posts one Web Push request and answers what it means for the device. It reaches only the address its host resolves
 * to, once, and never a private, loopback or link-local one: an endpoint whose host resolves to one is `refused`, with
 * no request. Redirects are never followed, so the request and its token reach only `url`, and an answer that does not
 * come within the timeout is `retry`. Errors are never passed on, since they can name the URL: one that is not a
 * missing answer becomes an error of its own.
 */
export const postPush = async (url: URL, headers: Record<string, string>, body: Uint8Array<ArrayBuffer>, options: PostOptions = {}): Promise<PushResult> => {
  // Built first, so a header that is not one throws as itself rather than as a failed request.
  const checked = new Headers(headers)
  const signal = AbortSignal.timeout(options.timeoutMs ?? defaultPushTimeoutMs)
  const send = options.request ?? pinned
  let response: Response
  try {
    response = await send(url, { method: 'POST', headers: checked, body, signal })
  } catch (error) {
    if (error instanceof AddressRefusedError) return { result: 'refused' }
    if (isTransient(error)) return { result: 'retry' }
    throw new Error('A Web Push request failed unexpectedly')
  }
  await response.body?.cancel()
  return pushResult(response)
}
