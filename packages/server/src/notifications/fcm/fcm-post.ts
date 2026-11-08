import { defaultPushTimeoutMs, isTransient, type PostOptions, type PushResult } from '../web-push/post'
import { fcmResult } from './fcm-result'

/**
 * Posts one FCM request and answers what it means for the device, as `fcmResult` says. Redirects are never followed,
 * so the request and its token reach only `url`, and an answer that does not come within the timeout is `retry`.
 * Fetch's own errors are never passed on: one that is not a missing answer becomes an error of its own.
 */
export const postFcm = async (url: URL, accessToken: string, body: unknown, options: PostOptions = {}): Promise<PushResult | 'unauthorized'> => {
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  const request = new Request(url, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'manual' })
  const send = options.fetch ?? fetch
  try {
    const response = await send(request, { signal: AbortSignal.timeout(options.timeoutMs ?? defaultPushTimeoutMs) })
    return fcmResult(response, await response.text())
  } catch (error) {
    if (isTransient(error)) return { result: 'retry' }
    throw new Error('An FCM request failed unexpectedly')
  }
}
