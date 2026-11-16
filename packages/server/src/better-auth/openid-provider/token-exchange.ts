import type { OAuthProviderExtension } from '@better-auth/oauth-provider'
import { APIError } from 'better-auth/api'
import { isOperatorClient, mayExchange } from './operator-clients'
import { idTokenSeconds, openIdScopes, tokenExchangeGrant } from './openid-provider-options'

export const accessTokenType = 'urn:ietf:params:oauth:token-type:access_token'
export const idTokenType = 'urn:ietf:params:oauth:token-type:id_token'

type GrantInput = Parameters<NonNullable<OAuthProviderExtension['grants']>[string]>[0]

type StoredAccessToken = { clientId?: string | null; userId?: string | null }

type ExchangeUser = { id: string; banned?: boolean | null; emailVerified?: boolean | null }

const refused = (error: string, description: string) => new APIError('BAD_REQUEST', { error, error_description: description })

/** What an exchange request asks for, or why it is refused: an access token of the caller's in, an ID token for `audience` out. */
export const exchangeRequest = (body: Record<string, unknown>) => {
  const { subject_token: subjectToken, subject_token_type: subjectType, requested_token_type: requestedType, audience } = body
  if (subjectType !== accessTokenType) return { problem: refused('invalid_request', `subject_token_type must be ${accessTokenType}`) }
  if (requestedType !== idTokenType) return { problem: refused('invalid_request', `requested_token_type must be ${idTokenType}`) }
  if (typeof subjectToken !== 'string' || !subjectToken) return { problem: refused('invalid_request', 'subject_token is required') }
  if (typeof audience !== 'string' || !audience) return { problem: refused('invalid_target', 'audience must name one client') }
  return { subjectToken, audience }
}

/** Why the person behind the caller's access token gets no ID token, or `undefined` when they get one. */
export const subjectProblem = (user: ExchangeUser | null) => {
  if (!user) return 'the person is gone'
  if (user.banned) return 'the person is banned'
  if (user.emailVerified !== true) return 'the address is not verified'
  return undefined
}

/**
 * The token exchange (RFC 8693) for a client the operator let exchange (`mayExchange`), such as a phone app signed in
 * once: it posts its own access token as `subject_token` and another registered client's id as `audience`, and gets an
 * ID token for that client, living `idTokenSeconds`, with no browser and no consent. The subject is always the person
 * the access token acts for, the token must be a live access token of this provider issued to the caller itself, and
 * the audience a client the operator registered other than the caller. Anything else is refused. The access token the
 * provider mints with the ID token is deleted at once, so only the ID token leaves.
 */
export const exchangeIdToken = async ({ ctx, provider }: GrantInput) => {
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

  const target = await provider.getClient(request.audience)
  if (!target || target.disabled || !isOperatorClient(target) || target.clientId === caller.clientId || !target.scopes?.includes('openid')) {
    throw refused('invalid_target', 'audience is not another client registered with this provider')
  }
  const user = await ctx.context.internalAdapter.findUserById(stored.userId)
  const problem = subjectProblem(user as ExchangeUser | null)
  if (problem) throw refused('invalid_grant', problem)

  const issued = await provider.issueTokens({ client: target, scopes: openIdScopes, user: user! })
  await ctx.context.adapter.deleteMany({ model: 'oauthAccessToken', where: [{ field: 'token', value: await provider.hashToken(issued.access_token, 'access_token') }] })
  if (!issued.id_token) throw new APIError('INTERNAL_SERVER_ERROR', { error: 'server_error', error_description: 'no ID token was issued' })
  // RFC 8693's answer, not the provider's token set: the issued token is in `access_token`, and it is no bearer token.
  return { access_token: issued.id_token, issued_token_type: idTokenType, token_type: 'N_A', expires_in: idTokenSeconds } as never
}

/** The provider extension with the exchange grant. */
export const tokenExchange = (): OAuthProviderExtension => ({ grants: { [tokenExchangeGrant]: exchangeIdToken } })
