import { ApiError } from '@protobase/client'

/** The push service of the app's phone: Apple's on iOS, Google's on Android. */
export type PushService = 'apns' | 'fcm'

/** iOS or Android could not register the app with its push service, and said why. */
export class PushRegistrationError extends Error {
  constructor(readonly reason: string) {
    super(`The push service could not register the app: ${reason}`)
  }
}

/** The push service gave the app no token in time: the phone did not reach it, or the app's signing lacks push. */
export class PushTokenTimeout extends Error {
  constructor(
    readonly service: PushService,
    ms: number,
  ) {
    super(`The push service gave the app no push token within ${ms} ms`)
  }
}

/** Push was turned off, but the device could not store that the user chose it, so it holds only until the app closes. */
export class PushChoiceNotStored extends Error {
  constructor() {
    super('Push is off, but this device could not store that the user turned it off')
  }
}

/** Why turning push on or off failed, for the bell to say. */
export type PushFailure =
  | { kind: 'registration'; reason: string }
  | { kind: 'no-token'; service: PushService }
  | { kind: 'refused'; reason: string }
  | { kind: 'off-not-stored' }
  | { kind: 'other'; reason: string }

/** The failure `error`, thrown by turning push on or off, stands for. */
export const pushFailure = (error: unknown): PushFailure => {
  if (error instanceof PushRegistrationError) return { kind: 'registration', reason: error.reason }
  if (error instanceof PushTokenTimeout) return { kind: 'no-token', service: error.service }
  if (error instanceof PushChoiceNotStored) return { kind: 'off-not-stored' }
  if (error instanceof ApiError) return { kind: 'refused', reason: error.message }
  return { kind: 'other', reason: error instanceof Error ? error.message : String(error) }
}
