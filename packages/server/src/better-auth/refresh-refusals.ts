import { AsyncLocalStorage } from 'node:async_hooks'
import type { BetterAuthPlugin } from 'better-auth'
import type { OAuthProvider } from '@better-auth/core/oauth2'

/**
 * The token endpoint's error (RFC 6749, section 5.2) that refuses the refresh token itself, as for a revoked grant or
 * an expired refresh token: the link no longer signs in, and only connecting it again helps.
 */
const refusal = 'invalid_grant'

/** Whether a provider's refresh threw for a refused grant: Better Auth's own fetch's error, or a connection provider's. */
export const refreshRefused = (error: unknown) => typeof error === 'object' && error !== null && (error as { error?: unknown }).error === refusal

// Better Auth's access-token endpoint answers every failed refresh with one code, a provider that was down as one that
// refused the grant; the providers' refreshes mark a refusal here, for the call `watchRefusals` runs.
const watched = new AsyncLocalStorage<{ refused: boolean }>()

/** Runs `work` and tells whether a provider refused a refresh token in it, whether `work` resolved or threw. */
export const watchRefusals = async <T>(work: () => Promise<T>) => {
  const outcome = { refused: false }
  const settled = await watched.run(outcome, () => work().then((value) => ({ value }), (error: unknown) => ({ error })))
  return { ...settled, refused: outcome.refused }
}

const marking = (provider: OAuthProvider): OAuthProvider => {
  const refresh = provider.refreshAccessToken
  if (!refresh) return provider
  return {
    ...provider,
    refreshAccessToken: async (...args: Parameters<typeof refresh>) => {
      try {
        return await refresh(...args)
      } catch (error) {
        if (refreshRefused(error)) {
          const outcome = watched.getStore()
          if (outcome) outcome.refused = true
        }
        throw error
      }
    },
  }
}

/** Has every provider's refresh mark a refused grant for `watchRefusals`; after the plugins that add providers. */
export const refreshRefusalsPlugin = () =>
  ({
    id: 'protobase-refresh-refusals',
    init: (ctx) => ({ context: { socialProviders: ctx.socialProviders.map(marking) } }),
  }) satisfies BetterAuthPlugin
