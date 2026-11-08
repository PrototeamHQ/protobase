import type { BetterAuthPlugin } from 'better-auth'
import { authorizationCodeRequest, createAuthorizationURL, getOAuth2Tokens, refreshAccessTokenRequest, type OAuth2Tokens, type OAuthProvider } from '@better-auth/core/oauth2'
import type { OAuthEndpoints } from '@protobase/workflows/plugin'
import { pinnedRequest } from '../../webhooks/table/pinned-request'
import { readLimited } from '../../webhooks/table/read-limited'
import type { ConnectionClient, ResolvedConnection } from './declared-connections'

/** The most of a provider's token or user answer read: enough for any token response, and no more. */
const answerBytes = 64 * 1024
const requestTimeoutMs = 10_000

type Guarded = { allowPrivateAddresses: boolean }

// A JSON answer of the provider, read through the guarded request: its host resolved once and refused when private
// (unless the app allows that), no redirect followed, at most `answerBytes` read. A refusal names the status only.
const guardedJson = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }, { allowPrivateAddresses }: Guarded) => {
  const response = await pinnedRequest(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) }, { allowPrivateAddresses })
  const bytes = await readLimited(response, answerBytes)
  if (!response.ok) throw new ProviderAnswerError(response.status, oauthError(bytes))
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
}

/** A provider's answer that is not a success: its status, and its OAuth `error` code when it gives one, as `invalid_grant`. */
export class ProviderAnswerError extends Error {
  constructor(
    readonly status: number,
    readonly error: string | undefined,
  ) {
    super(`The provider answered ${status}${error ? ` (${error})` : ''}`)
  }
}

// The `error` code of an OAuth error answer (RFC 6749, section 5.2); none for an answer that is not such JSON.
const oauthError = (bytes: Uint8Array) => {
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(bytes))
  } catch (error) {
    if (error instanceof SyntaxError) return
    throw error
  }
  const code = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined
  return typeof code === 'string' ? code : undefined
}

const tokenRequest = async (url: string, request: { body: URLSearchParams; headers: Record<string, string> }, guarded: Guarded) =>
  getOAuth2Tokens(await guardedJson(url, { method: 'POST', headers: request.headers, body: request.body.toString() }, guarded))

// The account the provider's user endpoint names: its `sub` or `id`, and its address and name when it gives them.
const userOf = (raw: Record<string, unknown>) => {
  const id = raw.sub ?? raw.id
  if (typeof id !== 'string' && typeof id !== 'number') return null
  const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined)
  const email = text(raw.email)
  return { user: { id: String(id), email, name: text(raw.name) ?? email ?? String(id), emailVerified: raw.email_verified === true }, data: raw }
}

/**
 * A Better Auth provider for a connection with an OAuth provider of its own: it never signs up anyone, and sends its
 * code exchange, refresh and user request only to the URLs the plugin declares, each through the guarded request.
 */
export const connectionOAuthProvider = (connection: ResolvedConnection & { client: ConnectionClient }, endpoints: OAuthEndpoints, guarded: Guarded) => {
  const options = { clientId: connection.client.clientId, clientSecret: connection.client.clientSecret }
  const pkce = endpoints.pkce ?? true
  return {
    id: connection.providerId,
    name: connection.declaration.label,
    disableSignUp: true,
    disableImplicitSignUp: true,
    options,
    // The account's stable id at the provider: its user endpoint's `sub`, or its `id`.
    accountSubject: ({ profile }: { profile: Record<string, unknown> }) => String(profile.sub ?? profile.id ?? ''),
    createAuthorizationURL: (data: Parameters<OAuthProvider['createAuthorizationURL']>[0]) =>
      createAuthorizationURL({
        id: connection.providerId,
        options,
        authorizationEndpoint: endpoints.authorization_url,
        state: data.state,
        ...(pkce && { codeVerifier: data.codeVerifier }),
        scopes: [...(connection.declaration.scopes ?? []), ...(data.scopes ?? [])],
        redirectURI: data.redirectURI,
        additionalParams: { ...connection.declaration.link_params },
      }),
    validateAuthorizationCode: async (data: Parameters<OAuthProvider['validateAuthorizationCode']>[0]) => {
      const request = await authorizationCodeRequest({ code: data.code, ...(pkce && { codeVerifier: data.codeVerifier }), redirectURI: data.redirectURI, options, tokenEndpoint: endpoints.token_url, authentication: 'post' })
      return tokenRequest(endpoints.token_url, request, guarded)
    },
    refreshAccessToken: async (refreshToken: string) => {
      const request = await refreshAccessTokenRequest({ refreshToken, options, tokenEndpoint: endpoints.token_url, authentication: 'post' })
      return tokenRequest(endpoints.token_url, request, guarded)
    },
    getUserInfo: async (tokens: OAuth2Tokens) => {
      const raw = await guardedJson(endpoints.user_info_url, { method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${tokens.accessToken}` } }, guarded)
      return userOf(raw)
    },
  }
}

/** Adds the connections' own OAuth providers to the instance's providers, so `/link-social` connects through them. */
export const connectionProvidersPlugin = (connections: readonly ResolvedConnection[], guarded: Guarded) => {
  const providers = connections.flatMap((connection) => ('oauth' in connection.declaration && connection.client ? [connectionOAuthProvider({ ...connection, client: connection.client }, connection.declaration.oauth, guarded)] : []))
  return {
    id: 'protobase-connection-providers',
    init: (ctx) => ({ context: { socialProviders: [...(providers as unknown as OAuthProvider[]), ...ctx.socialProviders] } }),
  } satisfies BetterAuthPlugin
}
