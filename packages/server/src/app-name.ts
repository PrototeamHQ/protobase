export const appNameVariable = 'PROTOBASE_APP_NAME'

/** The app's name when neither the app nor the platform names it. */
export const defaultAppName = 'Protobase'

/**
 * The app's name the platform passes in `PROTOBASE_APP_NAME`, such as `Property Finder`; `undefined` when it is not
 * set. Protobase names the app with it in sign-in prompts and in the mail it sends, over the name the app gives itself.
 */
export const readAppName = (env: Record<string, string | undefined>) => env[appNameVariable]?.trim() || undefined

/** The name the app goes by: the platform's `PROTOBASE_APP_NAME`, which deployments rename it with, over its own `own`. */
export const appNameOver = (env: Record<string, string | undefined>, own: string | undefined) => readAppName(env) ?? own

/** The name the app shows, in its upper left and its tabs, and mails as: its auth's, else the platform's, else the default. */
export const shownAppName = (auth: { appName?: string } | undefined, env: Record<string, string | undefined>) => auth?.appName ?? readAppName(env) ?? defaultAppName
