import type { PushResult } from '../web-push/post'

const fcmErrorType = 'type.googleapis.com/google.firebase.fcm.v1.FcmError'

// The FCM error code of an error answer's details, when it names one.
const fcmErrorCode = (body: unknown) => {
  const details = (body as { error?: { details?: unknown } } | null)?.error?.details
  if (!Array.isArray(details)) return
  const detail = details.find((item) => typeof item === 'object' && item !== null && item['@type'] === fcmErrorType)
  return typeof detail?.errorCode === 'string' ? detail.errorCode : undefined
}

const parsedJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return
    throw error
  }
}

const retryAfter = (response: Response): PushResult => {
  const seconds = response.headers.get('retry-after')?.trim()
  return seconds !== undefined && /^\d{1,7}$/.test(seconds) ? { result: 'retry', retryAfterSeconds: Number(seconds) } : { result: 'retry' }
}

/**
 * What an FCM answer means for the device: a 2xx with the sent message's name took it; only an error FCM names
 * `UNREGISTERED` says the token is gone; a 401 says the access token was refused (`unauthorized`, so the sender mints
 * another). Everything else asks to try again: a 429 or 5xx, and a 4xx that may be a configuration mistake, such as a
 * wrong project (a 404 without `UNREGISTERED`) or a service account without access (403), so no mistake of ours
 * removes devices.
 */
export const fcmResult = (response: Response, text: string): PushResult | 'unauthorized' => {
  const body = parsedJson(text)
  if (response.status >= 200 && response.status < 300) {
    const name = (body as { name?: unknown } | undefined)?.name
    return typeof name === 'string' ? { result: 'ok' } : { result: 'retry' }
  }
  if (fcmErrorCode(body) === 'UNREGISTERED') return { result: 'gone' }
  if (response.status === 401) return 'unauthorized'
  return retryAfter(response)
}
