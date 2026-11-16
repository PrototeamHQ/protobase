import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import type { SignInRefusal } from './sign-in-enforcement'
import { invalidSignInToken, verifySignInToken, type IdTokenVerification } from './sign-in-token'
import { saveTokenSession, useSignInToken } from './sign-in-token-uses'

// Better Auth signs in, or links, with an ID token a client posts instead of sending the browser through the provider.
const idTokenPaths = ['/sign-in/social', '/link-social']

export const tokenSignInOff: SignInRefusal = { code: 'TOKEN_SIGN_IN_OFF', message: 'Signing in with an ID token is turned off for this app.' }

export const signInTokenUsed: SignInRefusal = { code: 'TOKEN_USED', message: 'This sign-in token has been used already.' }

/** Whether a request to `path` with `body` posts an ID token to sign in or link with. */
export const postsIdToken = (path: string | undefined, body: unknown) =>
  path !== undefined && idTokenPaths.includes(path) && typeof body === 'object' && body !== null && (body as { idToken?: unknown }).idToken !== undefined

/** Whether a request that posts an ID token is a token sign-in with `provider`, the one provider it is on for. */
export const isTokenSignIn = (path: string, body: unknown, provider: string | undefined) =>
  provider !== undefined && path === '/sign-in/social' && (body as { provider?: unknown }).provider === provider

export type IdTokenSignInOptions = {
  /** The platform sign-in provider whose ID tokens sign in (`PlatformSignIn.tokenSignIn`): its id and client id. */
  tokenSignIn?: { provider: string; clientId: string }
}

type Provider = { id: string; idToken?: IdTokenVerification | { verify: unknown } }

/**
 * Refuses signing in or linking with a posted ID token (`403 TOKEN_SIGN_IN_OFF`), for every provider but the one
 * `tokenSignIn` names, and only for signing in: Better Auth accepts one from any provider that verifies ID tokens,
 * without a nonce or a limit on replay. A token for that one provider must be a sign-in token for this app
 * (`verifySignInToken`), else `401 INVALID_TOKEN`, and signs in once, else `401 TOKEN_USED`; then Better Auth signs
 * in the person it links to, never signing anyone up. The session it starts is noted as a token session, which never
 * counts as recently signed in (`isRecentlyConfirmed`).
 */
export const idTokenSignInPlugin = ({ tokenSignIn }: IdTokenSignInOptions = {}) =>
  ({
    id: 'protobase-id-token-sign-in',
    hooks: {
      before: [
        {
          matcher: (context) => context.path !== undefined && idTokenPaths.includes(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            if (!postsIdToken(ctx.path, ctx.body)) return
            if (!tokenSignIn || !isTokenSignIn(ctx.path, ctx.body, tokenSignIn.provider)) throw new APIError('FORBIDDEN', tokenSignInOff)
            const token = (ctx.body as { idToken?: { token?: unknown } }).idToken?.token
            const provider = (ctx.context.socialProviders as Provider[]).find(({ id }) => id === tokenSignIn.provider)
            // A provider whose discovery failed at startup is not there; Better Auth answers that it is not found.
            if (!provider) return
            const verification = provider.idToken && !('verify' in provider.idToken) ? provider.idToken : undefined
            const claims = typeof token === 'string' && verification ? await verifySignInToken(token, verification, tokenSignIn.clientId) : undefined
            if (!claims) throw new APIError('UNAUTHORIZED', invalidSignInToken)
            if (!(await useSignInToken(ctx.context, { ...claims, iss: claims.iss!, exp: claims.exp! }))) throw new APIError('UNAUTHORIZED', signInTokenUsed)
          }),
        },
      ],
      after: [
        {
          matcher: (context) => context.path === '/sign-in/social',
          handler: createAuthMiddleware(async (ctx) => {
            // No new session when it was refused, or while the second step is due (the two-factor plugin ended it).
            const session = ctx.context.newSession?.session
            if (!tokenSignIn || !session || !postsIdToken(ctx.path, ctx.body)) return
            await saveTokenSession(ctx.context, session)
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
