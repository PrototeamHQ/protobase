import type { PushFailure } from '../push/push-failure'
import { text } from './messages'

/** What the bell says about `failure`: the reason iOS, Android or the server gave, or what to check when none came. */
export const pushFailureText = (failure: PushFailure) => {
  if (failure.kind === 'registration') return text('pushRegistrationFailed', { reason: failure.reason })
  if (failure.kind === 'no-token') return text(failure.service === 'apns' ? 'pushNoTokenApns' : 'pushNoTokenFcm')
  if (failure.kind === 'refused') return text('pushRefused', { reason: failure.reason })
  return text('pushFailed', { reason: failure.reason })
}
