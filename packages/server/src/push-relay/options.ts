/**
 * Turns the app into a push relay, with `pushRelay: { appId }` in `protobase.config.ts`: it holds a mobile app's APNs
 * key and FCM service account and delivers the notifications of the workspaces it issued credentials to. `appId` is that
 * mobile app's id, the APNs topic of every push.
 */
export type PushRelayOptions = { appId: string }

// An iOS bundle id or Android package, as the APNs sender takes it.
const appIdPattern = /^[A-Za-z0-9._-]{1,155}$/

/** The options, checked as `pushRelay` takes them. */
export const checkPushRelayOptions = (options: PushRelayOptions) => {
  if (typeof options !== 'object' || options === null) throw new Error('pushRelay is { appId }, the mobile app\'s id')
  const unknown = Object.keys(options).find((key) => key !== 'appId')
  if (unknown !== undefined) throw new Error(`pushRelay takes no option "${unknown}": only appId`)
  if (typeof options.appId !== 'string' || !appIdPattern.test(options.appId)) throw new Error('pushRelay.appId is not a mobile app id: letters, digits, "." , "-" and "_"')
  return options
}
