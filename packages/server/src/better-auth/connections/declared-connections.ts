import { isIP } from 'node:net'
import type { ConnectionDeclaration } from '@protobase/workflows/plugin'
import { connectionProviderId } from '../../workflows/connections/connection-provider'

/** A connection a workflow plugin declares, as the app loaded it. */
export type DeclaredConnection = { plugin: string; name: string; declaration: ConnectionDeclaration }

/** The OAuth client an app's owner made at a provider for a workflow connection. */
export type ConnectionClient = { clientId: string; clientSecret: string }

/** A connection as sign-in keeps it: its Better Auth provider, and the client and URL that revoke its tokens. */
export type ResolvedConnection = DeclaredConnection & { key: string; providerId: string; client?: ConnectionClient; revocationUrl?: string }

type SocialClients = Record<string, { clientId?: unknown; clientSecret?: unknown } | undefined>

// A client's settings as the config gives them: both set, as text.
const clientOf = (value: { clientId?: unknown; clientSecret?: unknown } | undefined): ConnectionClient | undefined =>
  typeof value?.clientId === 'string' && value.clientId !== '' && typeof value.clientSecret === 'string' && value.clientSecret !== '' ? { clientId: value.clientId, clientSecret: value.clientSecret } : undefined

// An endpoint by an address rather than a name, such as 127.0.0.1 or localhost, reaches this machine or its network:
// only an app that allows private addresses, for development and tests, takes one.
const literalHost = (url: string) => {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
  return host === 'localhost' || isIP(host) !== 0
}

/**
 * The connections of an app's workflow plugins, each with its provider: the sign-in provider it names, whose client
 * revokes its tokens, or one of its own, whose client `clients` gives by `<plugin>:<connection>`. Startup stops on a
 * client no `oauth` connection declares, and on an endpoint by address unless `allowPrivateAddresses`.
 */
export const resolveConnections = (declared: readonly DeclaredConnection[], clients: Readonly<Record<string, ConnectionClient>>, socialProviders: SocialClients, allowPrivateAddresses: boolean): ResolvedConnection[] => {
  const keys = new Set(declared.filter(({ declaration }) => 'oauth' in declaration).map(({ plugin, name }) => `${plugin}:${name}`))
  const unknown = Object.keys(clients).find((key) => !keys.has(key))
  if (unknown !== undefined) throw new Error(`auth.connections: "${unknown}" is no workflow plugin's connection that signs in through a provider of its own`)
  return declared.map((connection) => {
    const { plugin, name, declaration } = connection
    const key = `${plugin}:${name}`
    const providerId = connectionProviderId(plugin, name, declaration)
    const urls = 'signIn' in declaration ? [declaration.revocation_url] : [declaration.oauth.authorization_url, declaration.oauth.token_url, declaration.oauth.user_info_url, declaration.oauth.revocation_url]
    if (!allowPrivateAddresses && urls.some((url) => url !== undefined && literalHost(url))) throw new Error(`Workflow plugin "${plugin}": the connection "${name}" names a host by its address; give its provider's name, or allow private addresses for development (workflows.allowPrivateAddresses)`)
    if ('signIn' in declaration) {
      const client = clientOf(socialProviders[declaration.signIn])
      return { ...connection, key, providerId, ...(client && { client }), ...(declaration.revocation_url && { revocationUrl: declaration.revocation_url }) }
    }
    const client = clientOf(clients[key])
    if (Object.hasOwn(clients, key) && !client) throw new Error(`auth.connections: "${key}" needs its clientId and clientSecret`)
    return { ...connection, key, providerId, ...(client && { client }), ...(declaration.oauth.revocation_url && { revocationUrl: declaration.oauth.revocation_url }) }
  })
}
