import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { generateRandomString } from 'better-auth/crypto'
import { signJWT, type JwtOptions } from 'better-auth/plugins'
import * as z from 'zod'
import { tokenRefusal, type SignInPolicyPluginOptions } from '../better-auth/policy-plugin'
import { goTrueAlgorithm } from './keys'
import { accessClaims, goTrueSession } from './session-json'
import { goTrueUser, type StoredAccount, type StoredUser } from './user-json'

export type GoTrueSessionsOptions = {
  /** The issuer of the access tokens, `goTrueIssuer(baseURL)`. */
  issuer: string
  /** The JWT plugin's own options, whose keys sign the access tokens. */
  jwt: JwtOptions
  /** Makes sure a live EdDSA key signs the app's own tokens (`signingKeys`), before this signs with the ES256 one. */
  signingKey: (ctx: Context) => Promise<void>
  /** The sign-in policy's, which holds tokens back as it does Protobase's own. */
  policy: SignInPolicyPluginOptions
}

type Context = Parameters<typeof signJWT>[0]

const refreshTokenNotFound = () => new APIError('BAD_REQUEST', { code: 'REFRESH_TOKEN_NOT_FOUND', message: 'Invalid Refresh Token: Refresh Token Not Found' })

/**
 * The sessions of the GoTrue-compatible endpoints, which are Better Auth's own: a session's token is the refresh token,
 * so signing out anywhere, a ban or a revoked session ends it, and refreshing gives the session a new token, so each
 * refresh token works once. Server-side endpoints only, for `goTrueRoutes`.
 */
export const goTrueSessionsPlugin = ({ issuer, jwt, signingKey, policy }: GoTrueSessionsOptions) => {
  const sessionOf = async (ctx: Context, sessionToken: string) => {
    const found = await ctx.context.internalAdapter.findSession(sessionToken)
    if (!found) throw refreshTokenNotFound()
    const user = found.user as typeof found.user & StoredUser
    const refusal = await tokenRefusal(ctx.context, user, policy)
    if (refusal) throw new APIError('FORBIDDEN', refusal)
    const accounts = (await ctx.context.internalAdapter.findAccounts(user.id)) as StoredAccount[]
    const now = Math.floor(Date.now() / 1000)
    // Protobase's own tokens are signed with the newest live EdDSA key, or the newest live key of all when there is
    // none; an EdDSA key made before the ES256 one keeps them EdDSA.
    await signingKey(ctx)
    const accessToken = await signJWT(ctx, { options: jwt, payload: accessClaims({ user, accounts, sessionId: found.session.id, issuer, now }), signingAlgorithm: goTrueAlgorithm })
    return goTrueSession({ accessToken, refreshToken: sessionToken, issuedAt: now, user: goTrueUser(user, accounts) })
  }

  return {
    id: 'protobase-gotrue-sessions',
    endpoints: {
      /** The GoTrue session of the Better Auth session with `sessionToken`: an access token for it, and the token to refresh it with. */
      goTrueSession: createAuthEndpoint.serverOnly({ method: 'POST', body: z.object({ sessionToken: z.string().min(1) }) }, async (ctx) =>
        ctx.json(await sessionOf(ctx, ctx.body.sessionToken)),
      ),

      /**
       * Refreshes the session whose token is `refreshToken`: gives it a new token and a new lifetime, and answers its
       * GoTrue session. Of two refreshes with the same token, only one finds it.
       */
      goTrueRefresh: createAuthEndpoint.serverOnly({ method: 'POST', body: z.object({ refreshToken: z.string().min(1) }) }, async (ctx) => {
        const { internalAdapter, sessionConfig } = ctx.context
        const found = await internalAdapter.findSession(ctx.body.refreshToken)
        if (!found || new Date(found.session.expiresAt) <= new Date()) throw refreshTokenNotFound()
        const token = generateRandomString(32)
        const rotated = await internalAdapter.updateSession(ctx.body.refreshToken, { token, expiresAt: new Date(Date.now() + sessionConfig.expiresIn * 1000) })
        if (!rotated) throw refreshTokenNotFound()
        return ctx.json(await sessionOf(ctx, token))
      }),
    },
  } satisfies BetterAuthPlugin
}
