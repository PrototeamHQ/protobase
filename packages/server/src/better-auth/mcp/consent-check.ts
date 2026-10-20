import type { OAuthProviderExtension } from '@better-auth/oauth-provider'
import { APIError } from 'better-auth/api'

/** Better Auth's model of the consents the OAuth provider stores, one per client, user and grant. */
export const consentModel = 'oauthConsent'

const disconnected = () => new APIError('BAD_REQUEST', { error: 'invalid_grant', error_description: 'You disconnected this client: connect it again.' })

/**
 * A provider extension that makes the consent the one source of truth for issuing tokens: every MCP access token, at
 * the code exchange and at each refresh, needs the consent of its client, user and grant (`referenceId`) to still
 * exist. Disconnecting a client deletes its consents, so a code issued just before, or a refresh token left over,
 * gets `invalid_grant`. It runs before the provider writes a new refresh token.
 */
export const mcpConsentCheck = (): OAuthProviderExtension => ({
  claims: {
    accessToken: async ({ ctx, client, user, referenceId }) => {
      if (!user || !referenceId) throw disconnected()
      const where = [
        { field: 'clientId', value: client.clientId },
        { field: 'userId', value: user.id },
        { field: 'referenceId', value: referenceId },
      ]
      if (!(await ctx.context.adapter.findOne({ model: consentModel, where }))) throw disconnected()
      return {}
    },
  },
})
