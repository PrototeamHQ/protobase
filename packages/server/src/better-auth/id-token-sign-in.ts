import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import type { SignInRefusal } from './sign-in-enforcement'

// Better Auth signs in, or links, with an ID token a client posts instead of sending the browser through the provider.
const idTokenPaths = ['/sign-in/social', '/link-social']

export const tokenSignInOff: SignInRefusal = { code: 'TOKEN_SIGN_IN_OFF', message: 'Signing in with an ID token is turned off for this app.' }

/** Whether a request to `path` with `body` posts an ID token to sign in or link with. */
export const postsIdToken = (path: string | undefined, body: unknown) =>
  path !== undefined && idTokenPaths.includes(path) && typeof body === 'object' && body !== null && (body as { idToken?: unknown }).idToken !== undefined

/**
 * Refuses signing in or linking with a posted ID token, for every provider: Better Auth accepts one from any provider
 * that verifies ID tokens, without a nonce or a limit on replay, and without the app's second step. Signing in goes
 * through the provider's own pages instead.
 */
export const idTokenSignInPlugin = () =>
  ({
    id: 'protobase-id-token-sign-in',
    hooks: {
      before: [
        {
          matcher: (context) => context.path !== undefined && idTokenPaths.includes(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            if (postsIdToken(ctx.path, ctx.body)) throw new APIError('FORBIDDEN', tokenSignInOff)
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
