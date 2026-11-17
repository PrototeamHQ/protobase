import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import type { SignInRefusal } from './sign-in-enforcement'

export const authorizationParamsFixed: SignInRefusal = { code: 'AUTHORIZATION_PARAMS_FIXED', message: "This provider's sign-in takes no parameters from the client." }

// Where a browser starts out to a provider's pages, with the parameters a client may add to the authorization request.
const startPaths = ['/sign-in/social', '/link-social']

/** Whether a request to `path` adds authorization parameters of its own to a sign-in or a link with one of `providers`. */
export const addsAuthorizationParams = (path: string | undefined, body: unknown, providers: string[]) => {
  if (path === undefined || !startPaths.includes(path) || typeof body !== 'object' || body === null) return false
  const { provider, additionalParams } = body as { provider?: unknown; additionalParams?: unknown }
  return providers.includes(provider as string) && typeof additionalParams === 'object' && additionalParams !== null && Object.keys(additionalParams).length > 0
}

/**
 * Refuses a sign-in or a link with one of the platform's `providers` that brings authorization parameters of its own
 * (`400 AUTHORIZATION_PARAMS_FIXED`): each request carries the provider's `authorizationParams` alone, which Better
 * Auth would let the client's replace.
 */
export const fixedAuthorizationParamsPlugin = (providers: string[]) =>
  ({
    id: 'protobase-fixed-authorization-params',
    hooks: {
      before: [
        {
          matcher: (context) => addsAuthorizationParams(context.path, context.body, providers),
          handler: createAuthMiddleware(async () => {
            throw new APIError('BAD_REQUEST', authorizationParamsFixed)
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
