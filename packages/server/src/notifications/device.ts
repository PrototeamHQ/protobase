/** How a device receives push: a browser's Web Push subscription, an iOS app's APNs token or an Android app's FCM token. */
export const deviceKinds = ['web', 'apns', 'fcm'] as const
export type DeviceKind = (typeof deviceKinds)[number]

/** The APNs environment an iOS build's token belongs to. */
export const apnsEnvironments = ['sandbox', 'production'] as const
export type ApnsEnvironment = (typeof apnsEnvironments)[number]

/**
 * A device as a signed-in user registers it. `token` is unique among all devices: the APNs or FCM token, or for `web`
 * the subscription's endpoint URL. A field that does not apply to the kind is `null`: the Web Push keys (`p256dh`,
 * `auth`) for web only, the APNs `environment` for apns only, the `appId` (the iOS bundle id or Android package) for
 * apns and fcm.
 */
export type NewDevice = {
  kind: DeviceKind
  token: string
  p256dh: string | null
  auth: string | null
  environment: ApnsEnvironment | null
  appId: string | null
  userAgent: string | null
}

/** A stored device: whose it is, its own id, when it was registered by that user and when last seen. */
export type Device = NewDevice & { id: string; userId: string; createdAt: Date; lastSeenAt: Date }
