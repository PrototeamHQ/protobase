import type { PushResult } from '../web-push/post'
import type { ApnsAnswer } from './post'

/**
 * What APNs's answer means for the device: 200 took it; 410, and 400 `BadDeviceToken` (a dead token, or one of the
 * other environment), say the device is gone; no answer, a 429, a 5xx and every other status, such as a wrong topic or
 * key (`BadTopic`, `InvalidProviderToken`), ask to try again, so no mistake of ours removes devices.
 */
export const apnsResult = (answer: ApnsAnswer): PushResult => {
  if (answer?.status === 200) return { result: 'ok' }
  if (answer?.status === 410) return { result: 'gone' }
  if (answer?.status === 400 && answer.reason === 'BadDeviceToken') return { result: 'gone' }
  const seconds = answer?.retryAfter?.trim()
  return seconds !== undefined && /^\d{1,7}$/.test(seconds) ? { result: 'retry', retryAfterSeconds: Number(seconds) } : { result: 'retry' }
}
