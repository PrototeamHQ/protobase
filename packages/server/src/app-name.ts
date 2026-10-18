export const appNameVariable = 'PROTOBASE_APP_NAME'

/** The app's name when neither the app nor the platform names it. */
export const defaultAppName = 'Protobase'

/**
 * The app's name the platform passes in `PROTOBASE_APP_NAME`, such as `Property Finder`; `undefined` when it is not
 * set. Protobase names the app with it in sign-in prompts and in the mail it sends, unless the app names itself.
 */
export const readAppName = (env: Record<string, string | undefined>) => env[appNameVariable]?.trim() || undefined
