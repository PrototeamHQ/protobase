import type { BetterAuthPlugin, DBAdapter } from 'better-auth'
import { APIError, createAuthEndpoint, createAuthMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { adminOnly } from '../admin-only'
import { onAudienceHost, type AudiencePattern } from './audience-patterns'
import { isDeclaredClient, type DeclaredClient } from './declared-clients'
import { openIdScopes, tokenExchangeGrant } from './openid-provider-options'

// A client the operator registered carries this in its metadata; any other in the store, such as one an MCP client
// registered while the app had `mcp` on, gets nothing from the OpenID provider.
const operatorMark = 'protobase_operator_client'

/** A client as the operator API lists it. */
export type OperatorClient = { clientId: string; name: string; redirectUris: string[]; type: 'confidential' | 'public'; exchange: boolean }

type StoredClient = { clientId: string; name?: string | null; redirectUris?: string[] | null; tokenEndpointAuthMethod?: string | null; grantTypes?: string[] | null; metadata?: unknown; clientDiscoveryId?: string | null }

const metadataOf = (client: Pick<StoredClient, 'metadata'>) => {
  const { metadata } = client
  const parsed = typeof metadata === 'string' ? (JSON.parse(metadata) as unknown) : metadata
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
}

/** Whether the operator registered `client`, so the OpenID provider serves it. */
export const isOperatorClient = (client: Pick<StoredClient, 'metadata'> | null | undefined) => Boolean(client && metadataOf(client)[operatorMark] === true)

/**
 * Whether the OpenID provider serves `client`, one the operator registered or the config declares; the provider's own
 * lookup already drops a declared client the config no longer declares.
 */
export const isServedClient = (client: Pick<StoredClient, 'metadata' | 'clientDiscoveryId'> | null | undefined) => isOperatorClient(client) || isDeclaredClient(client)

/** Whether the operator let `client` exchange its access token for other clients' ID tokens. */
export const mayExchange = (client: Pick<StoredClient, 'grantTypes'>) => (client.grantTypes ?? []).includes(tokenExchangeGrant)

const listed = (client: StoredClient): OperatorClient => ({
  clientId: client.clientId,
  name: client.name ?? '',
  redirectUris: client.redirectUris ?? [],
  type: client.tokenEndpointAuthMethod === 'none' ? 'public' : 'confidential',
  exchange: mayExchange(client),
})

/** What the operator registers a client with. */
export const registration = z.object({
  /** Shown to nobody but the operator: no consent page asks for the client. */
  name: z.string().trim().min(1),
  /** Every address the client may be sent back to, matched exactly. */
  redirectUris: z.array(z.string().url()).min(1),
  /** `confidential` authenticates with the secret it gets once (an app's server); `public` with PKCE only (a phone app). */
  type: z.enum(['confidential', 'public']),
  /** May exchange its access token for an ID token of another registered client (`tokenExchangeGrant`). */
  exchange: z.boolean().optional(),
})

export type OperatorRegistration = z.infer<typeof registration>

/**
 * The provider's client registration for `input`: consent skipped, PKCE required, the OpenID scopes, and the code
 * grant; a client that may exchange also gets refresh tokens and the exchange grant.
 */
export const registrationBody = ({ name, redirectUris, type, exchange = false }: OperatorRegistration) => ({
  client_name: name,
  redirect_uris: redirectUris,
  token_endpoint_auth_method: type === 'public' ? 'none' : 'client_secret_basic',
  application_type: type === 'public' ? 'native' : 'web',
  grant_types: ['authorization_code', ...(exchange ? ['refresh_token', tokenExchangeGrant] : [])],
  response_types: ['code'],
  scope: [...openIdScopes, ...(exchange ? ['offline_access'] : [])].join(' '),
  skip_consent: true,
  require_pkce: true,
  metadata: { [operatorMark]: true },
})

type Adapter = Pick<DBAdapter, 'findMany' | 'deleteMany'>

/** Deletes the client, after its consents, access tokens and refresh tokens, so nothing it was given works any more. */
export const deleteOperatorClient = async (adapter: Adapter, clientId: string) => {
  const where = [{ field: 'clientId', value: clientId }]
  await adapter.deleteMany({ model: 'oauthConsent', where })
  await adapter.deleteMany({ model: 'oauthAccessToken', where })
  await adapter.deleteMany({ model: 'oauthRefreshToken', where })
  await adapter.deleteMany({ model: 'oauthClient', where })
}

const operatorOnly = adminOnly('Only an admin registers the clients of the OpenID provider.')

const onAudienceHostRefusal = (uri: string) => new APIError('BAD_REQUEST', { code: 'REDIRECT_ON_AUDIENCE_HOST', message: `${uri} is on a host of auth.openIdProvider.audiences, which only the token exchange issues tokens for.` })

type Endpoint = (input: Record<string, unknown>) => Promise<unknown>

/**
 * The operator's API for the OpenID provider's clients, for admins only (`403 ADMIN_ONLY`): `POST
 * /openid-provider/clients` registers one (`registration`) and answers its `clientId`, with its `clientSecret` once
 * for a confidential client; `GET /openid-provider/clients` lists them; `POST /openid-provider/clients/delete` with
 * `{ clientId }` deletes one and what it was given. A redirect URI on a host of `audiences` is refused (`400
 * REDIRECT_ON_AUDIENCE_HOST`): those apps get ID tokens from the token exchange alone.
 */
export const operatorClientsPlugin = (audiences: readonly AudiencePattern[]) =>
  ({
    id: 'protobase-openid-operator-clients',
    endpoints: {
      registerOperatorClient: createAuthEndpoint('/openid-provider/clients', { method: 'POST', use: [operatorOnly], body: registration }, async (ctx) => {
        const provider = ctx.context.getPlugin('oauth-provider') as { endpoints: { adminCreateOAuthClient: Endpoint } } | null
        if (!provider) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'The OpenID provider is not on' })
        const onHost = ctx.body.redirectUris.find((uri) => onAudienceHost(audiences, uri))
        if (onHost) throw onAudienceHostRefusal(onHost)
        // Called as Better Auth's own plugins call another endpoint: with this request's context, answering its body.
        const { response: created } = (await provider.endpoints.adminCreateOAuthClient({ ...ctx, body: registrationBody(ctx.body), asResponse: false, returnHeaders: true })) as { response: { client_id: string; client_secret?: string } }
        return ctx.json({ clientId: created.client_id, ...(created.client_secret && { clientSecret: created.client_secret }) })
      }),
      listOperatorClients: createAuthEndpoint('/openid-provider/clients', { method: 'GET', use: [operatorOnly] }, async (ctx) => {
        const clients = await ctx.context.adapter.findMany<StoredClient>({ model: 'oauthClient' })
        return ctx.json(clients.filter(isOperatorClient).map(listed))
      }),
      deleteOperatorClient: createAuthEndpoint('/openid-provider/clients/delete', { method: 'POST', use: [operatorOnly], body: z.object({ clientId: z.string().min(1) }) }, async (ctx) => {
        const [client] = await ctx.context.adapter.findMany<StoredClient>({ model: 'oauthClient', where: [{ field: 'clientId', value: ctx.body.clientId }] })
        if (!isOperatorClient(client)) throw new APIError('NOT_FOUND', { code: 'CLIENT_NOT_FOUND', message: 'No client the operator registered has this id.' })
        await deleteOperatorClient(ctx.context.adapter, ctx.body.clientId)
        return ctx.json({ clientId: ctx.body.clientId })
      }),
    },
  }) satisfies BetterAuthPlugin

/** The client id a token request names: in its body, else in its Basic credentials. */
export const tokenRequestClientId = (body: unknown, authorization: string | null | undefined) => {
  const named = typeof body === 'object' && body !== null ? (body as { client_id?: unknown }).client_id : undefined
  if (typeof named === 'string' && named) return named
  const [scheme, credentials] = (authorization ?? '').split(' ')
  if (scheme?.toLowerCase() !== 'basic' || !credentials) return
  try {
    const id = atob(credentials).split(':')[0]
    return id ? decodeURIComponent(id) : undefined
  } catch {
    return
  }
}

const unregistered = () => new APIError('BAD_REQUEST', { error: 'invalid_client', error_description: 'client not registered with this provider' })
const declaredTwice = () => new APIError('BAD_REQUEST', { error: 'invalid_client', error_description: 'client id is both declared in the app config and registered by an admin; delete one of them' })

/**
 * Refuses every client the operator did not register and `declared` does not hold (`400 invalid_client`), before the
 * provider looks at the request: at authorize, so a browser is never sent to a redirect URI of such a client, and at the token endpoint, so
 * no code, refresh token or exchange gives it anything. A request that names no client is refused too, and so is an
 * authorize whose client id or redirect URI is on a host of `audiences`, which no browser is ever sent to. A declared
 * id an admin registered a client under too is refused rather than served as either.
 */
export const operatorClientsOnly = (audiences: readonly AudiencePattern[], declared: readonly DeclaredClient[]) => {
  const declaredIds = new Set(declared.map((client) => client.clientId))
  return {
    id: 'protobase-openid-operator-clients-only',
    hooks: {
      before: [
        {
          matcher: (context) => context.path === '/oauth2/authorize' || context.path === '/oauth2/token',
          handler: createAuthMiddleware(async (ctx) => {
            const clientId =
              ctx.path === '/oauth2/token'
                ? tokenRequestClientId(ctx.body, ctx.headers?.get('authorization'))
                : ((ctx.body as { client_id?: unknown } | undefined)?.client_id ?? (ctx.query as { client_id?: unknown } | undefined)?.client_id)
            if (typeof clientId !== 'string' || !clientId) throw unregistered()
            if (ctx.path === '/oauth2/authorize') {
              const redirectUri = (ctx.body as { redirect_uri?: unknown } | undefined)?.redirect_uri ?? (ctx.query as { redirect_uri?: unknown } | undefined)?.redirect_uri
              if (onAudienceHost(audiences, clientId) || onAudienceHost(audiences, redirectUri)) throw new APIError('BAD_REQUEST', { error: 'invalid_request', error_description: 'the token exchange alone issues tokens for this host' })
            }
            const [client] = await ctx.context.adapter.findMany<StoredClient>({ model: 'oauthClient', where: [{ field: 'clientId', value: clientId }], limit: 1 })
            if (declaredIds.has(clientId)) {
              // No record yet: the provider writes it on this first use.
              if (client && !isDeclaredClient(client)) throw declaredTwice()
              return
            }
            if (!isOperatorClient(client)) throw unregistered()
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}
