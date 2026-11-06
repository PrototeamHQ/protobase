import type { Unavailable } from './type-list'

/**
 * What an app can connect accounts with: none without sign-in; otherwise whether it stores OAuth tokens encrypted,
 * its sign-in providers, and the connections `<plugin>:<connection>` whose OAuth client its owner set.
 */
export type ConnectionSupport = { encrypted: boolean; signInProviders: readonly string[]; clients: readonly string[] } | undefined

/** A type that signs in is unavailable only while the app cannot make its connection, saying why. */
export const connectionUnavailable =
  (support: ConnectionSupport): Unavailable =>
  (type) => {
    const connection = type.connection
    if (!connection) return
    if (!support) return 'It signs in through a connection, and this app has no sign-in to connect an account with'
    if (!support.encrypted) return 'It signs in through a connection, whose tokens this app would store in plain text; turn on auth.encryptOAuthTokens'
    if ('signIn' in connection) {
      if (support.signInProviders.includes(connection.signIn)) return
      return `It signs in through "${connection.signIn}", which is not one of this app's sign-in providers (auth.socialProviders)`
    }
    const key = `${type.plugin}:${connection.name}`
    if (support.clients.includes(key)) return
    return `It signs in through ${key}, whose OAuth client this app does not set in auth.connections`
  }
