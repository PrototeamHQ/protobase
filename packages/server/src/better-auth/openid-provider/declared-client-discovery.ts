import type { OAuthProviderExtension, SchemaClient, Scope } from '@better-auth/oauth-provider'
import { declaredClientsSource, isDeclaredClient, type DeclaredClient } from './declared-clients'
import { registrationBody } from './operator-clients'

type Stored = SchemaClient<Scope[]>

/**
 * The provider's record of a declared client: what the operator API registers a public client with (`registrationBody`)
 * under the declared id, owned by `declaredClientsSource` instead of carrying the operator's mark.
 */
export const declaredClientRecord = (client: DeclaredClient) => {
  const body = registrationBody(client)
  return {
    clientId: client.clientId,
    clientDiscoveryId: declaredClientsSource,
    name: body.client_name,
    redirectUris: body.redirect_uris,
    tokenEndpointAuthMethod: body.token_endpoint_auth_method,
    applicationType: body.application_type,
    grantTypes: body.grant_types,
    responseTypes: body.response_types,
    scopes: body.scope.split(' '),
    skipConsent: body.skip_consent,
    requirePKCE: body.require_pkce,
  }
}

/** Whether `stored` differs from `record` in a field the record sets. */
export const recordChanged = (stored: object, record: object) =>
  Object.entries(record).some(([field, value]) => JSON.stringify((stored as Record<string, unknown>)[field]) !== JSON.stringify(value))

/**
 * The provider extension that serves `clients` from the config: the provider looks a declared id up as it looks up
 * any client, and its record is written on first use and rewritten when the config changes it, so every token points
 * at it as at a registered client's. A stored record whose id the config no longer declares is no client: the
 * provider refuses it, with every token it holds; declaring the id again brings back the ones still live.
 */
export const declaredClients = (clients: readonly DeclaredClient[]): OAuthProviderExtension => {
  const byId = new Map(clients.map((client) => [client.clientId, client]))
  return {
    clientDiscovery: {
      id: declaredClientsSource,
      matches: (clientId) => byId.has(clientId),
      resolve: async (ctx, clientId, existing) => {
        const record = declaredClientRecord(byId.get(clientId)!)
        const { adapter } = ctx.context
        if (existing) {
          if (!recordChanged(existing, record)) return existing
          return adapter.update<Stored>({ model: 'oauthClient', where: [{ field: 'clientId', value: clientId }], update: { ...record, updatedAt: new Date() } })
        }
        const now = new Date()
        return adapter.create<Record<string, unknown>, Stored>({ model: 'oauthClient', data: { ...record, createdAt: now, updatedAt: now } }).catch(async (error: unknown) => {
          // A request at the same time wrote it first: its record will do.
          const written = await adapter.findOne<Stored>({ model: 'oauthClient', where: [{ field: 'clientId', value: clientId }] })
          if (!isDeclaredClient(written)) throw error
          return written
        })
      },
    },
  }
}
