// One app id serves both platforms, so it follows the rules both accept: iOS bundle ids hold letters, digits, `-` and
// `.` (CFBundleIdentifier); Android application ids hold at least two dot-separated segments, each starting with a
// letter and holding letters, digits and `_`. Neither `-` nor `_` is in both.
const appIdPattern = /^[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+$/

// `appId` with what neither platform allows taken out, when that leaves a valid id.
const suggestedAppId = (appId: string) => {
  const segments = appId.split('.').map((segment) => segment.replace(/[^a-zA-Z0-9]/g, '').replace(/^[0-9]+/, '')).filter(Boolean)
  const suggestion = segments.join('.')
  return appIdPattern.test(suggestion) ? suggestion : 'com.example.app'
}

/** Whether `appId` can be the app's id on both iOS and Android. */
export const isAppId = (appId: unknown): appId is string => typeof appId === 'string' && appIdPattern.test(appId)

/** Why `appId` cannot be the app's id on both iOS and Android, with a fixed id to use instead. */
export const appIdProblem = (appId: unknown) => {
  const suggestion = typeof appId === 'string' ? suggestedAppId(appId) : 'com.example.app'
  return `mobile.appId must be a reverse-DNS id that iOS and Android both accept: at least two parts separated by dots, each starting with a letter and holding only letters and digits (no underscores or hyphens), such as ${suggestion}, not ${JSON.stringify(appId)}`
}
