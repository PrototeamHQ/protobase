import type { OAuthProviderExtension } from '@better-auth/oauth-provider'
import { APIError } from 'better-auth/api'
import { matchesAudience, type AudiencePattern } from './audience-patterns'
import { idTokenClaims } from './id-token-claims'
import { isOperatorClient, mayExchange } from './operator-clients'
import { idTokenSeconds, openIdScopes, tokenExchangeGrant } from './openid-provider-options'

export const accessTokenType = 'urn:ietf:params:oauth:token-type:access_token'
export const idTokenType = 'urn:ietf:params:oauth:token-type:id_token'

type GrantInput = Parameters<NonNullable<OAuthProviderExtension['grants']>[string]>[0]

type StoredAccessToken = { clientId?: string | null; userId?: string | null }

type ExchangeUser = { id: string; email: string; emailVerified: boolean; name?: string | null; image?: string | null; banned?: boolean | null }

type SignEndpoint = (input: Record<string, unknown>) => Promise<{ response: { token: string } }>

const refused = (error: string, description: string) => new APIError('BAD_REQUEST', { error, error_description: description })

/** What an exchange request asks for, or why it is refused: an access token of the caller's in, an ID token for `audience` out. */
export const exchangeRequest = (body: Record<string, unknown>) => {
  const { subject_token: subjectToken, subject_token_type: subjectType, requested_token_type: requestedType, audience } = body
  if (subjectType !== accessTokenType) return { problem: refused('invalid_request', `subject_token_type must be ${accessTokenType}`) }
  if (requestedType !== idTokenType) return { problem: refused('invalid_request', `requested_token_type must be ${idTokenType}`) }
  if (typeof subjectToken !== 'string' || !subjectToken) return { problem: refused('invalid_request', 'subject_token is required') }
  if (typeof audience !== 'string' || !audience) return { problem: refused('invalid_target', 'audience must name one client or origin') }
  return { subjectToken, audience }
}

/** Why the person behind the caller's access token gets no ID token, or `undefined` when they get one. */
export const subjectProblem = (user: Pick<ExchangeUser, 'banned' | 'emailVerified'> | null) => {
  if (!user) return 'the person is gone'
  if (user.banned) return 'the person is banned'
  if (user.emailVerified !== true) return 'the address is not verified'
  return undefined
}

// The answer of RFC 8693, not the provider's token set: the issued token is in `access_token`, and it is no bearer token.
const exchanged = (idToken: string) => ({ access_token: idToken, issued_token_type: idTokenType, token_type: 'N_A', expires_in: idTokenSeconds }) as never

/**
 * An ID token for an origin of `audiences`, signed with the app's keys, as the provider signs its own. An origin has
 * no client record, which every token the provider stores must point at, so `issueTokens` cannot mint for it; this
 * issues the ID token alone, with the claims the provider's carry and a `jti` of its own.
 */
const originIdToken = async (ctx: GrantInput['ctx'], user: ExchangeUser, audience: string) => {
  const iat = Math.floor(Date.now() / 1000)
  const payload = { sub: user.id, aud: audience, iat, exp: iat + idTokenSeconds, jti: crypto.randomUUID(), ...idTokenClaims({ user, scopes: openIdScopes }) }
  const sign = (ctx.context.getPlugin('jwt') as unknown as { endpoints: { signJWT: SignEndpoint } }).endpoints.signJWT
  // Called as Better Auth's own plugins call another endpoint: with this request's context, answering its body.
  const { response } = await sign({ ...ctx, body: { payload }, asResponse: false, returnHeaders: true })
  return response.token
}

/**
 * The token exchange (RFC 8693) for a client the operator let exchange (`mayExchange`), such as a phone app signed in
 * once: it posts its own access token as `subject_token` and, as `audience`, another client the operator registered or
 * an origin one of `audiences` stands for, and gets an ID token for it alone, living `idTokenSeconds`, with no browser
 * and no consent. The subject is always the person the access token acts for, and the token must be a live access
 * token of this provider issued to the caller itself. Anything else is refused. For a registered client the provider
 * issues the ID token, and the access token it mints with it is deleted at once, so only the ID token leaves; for an
 * origin, `originIdToken` does.
 */
export const exchangeIdToken = (audiences: readonly AudiencePattern[]) => async ({ ctx, provider }: GrantInput) => {
  const request = exchangeRequest((ctx.body ?? {}) as Record<string, unknown>)
  if ('problem' in request) throw request.problem
  const { client: caller } = await provider.authenticateClient({ requireCredentials: false })
  if (!isOperatorClient(caller) || !mayExchange(caller)) throw refused('unauthorized_client', 'client may not exchange tokens')

  const stored = await ctx.context.adapter.findOne<StoredAccessToken>({ model: 'oauthAccessToken', where: [{ field: 'token', value: await provider.hashToken(request.subjectToken, 'access_token') }] })
  if (!stored?.userId || stored.clientId !== caller.clientId) throw refused('invalid_grant', 'subject_token is not an access token of this client')
  // Expired, revoked, or its session ended: the provider refuses it, and so does the exchange.
  try {
    await provider.requireActiveAccessToken(request.subjectToken, caller.clientId)
  } catch {
    throw refused('invalid_grant', 'subject_token is not active')
  }

  const origin = matchesAudience(audiences, request.audience)
  const target = origin ? undefined : await provider.getClient(request.audience)
  if (!origin && (!target || target.disabled || !isOperatorClient(target) || target.clientId === caller.clientId || !target.scopes?.includes('openid'))) {
    throw refused('invalid_target', 'audience is not another client or an origin of this provider')
  }
  const user = await ctx.context.internalAdapter.findUserById(stored.userId)
  const problem = subjectProblem(user as ExchangeUser | null)
  if (problem) throw refused('invalid_grant', problem)
  if (origin) return exchanged(await originIdToken(ctx, user as ExchangeUser, request.audience))

  const issued = await provider.issueTokens({ client: target!, scopes: openIdScopes, user: user! })
  await ctx.context.adapter.deleteMany({ model: 'oauthAccessToken', where: [{ field: 'token', value: await provider.hashToken(issued.access_token, 'access_token') }] })
  if (!issued.id_token) throw new APIError('INTERNAL_SERVER_ERROR', { error: 'server_error', error_description: 'no ID token was issued' })
  return exchanged(issued.id_token)
}

/** The provider extension with the exchange grant. */
export const tokenExchange = (audiences: readonly AudiencePattern[]): OAuthProviderExtension => ({ grants: { [tokenExchangeGrant]: exchangeIdToken(audiences) } })
