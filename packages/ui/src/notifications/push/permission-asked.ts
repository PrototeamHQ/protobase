// The Android version in the app's user agent, which Android's WebView gives in full, such as `Android 16;`.
const androidVersion = /\bAndroid (\d+)/

/**
 * Whether the app's notification permission is the person's own answer: on iOS and from Android 13 on the phone asks
 * them, while older Android grants it without asking. An Android version the user agent does not give counts as
 * not asked.
 */
export const permissionAsked = (platform: string, userAgent: string) => {
  if (platform === 'ios') return true
  const version = androidVersion.exec(userAgent)?.[1]
  return platform === 'android' && version !== undefined && Number(version) >= 13
}
