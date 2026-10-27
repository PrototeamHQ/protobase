import { passkeyClient } from '@better-auth/passkey/client'
import { createAuthClient } from 'better-auth/client'
import { emailOTPClient, jwtClient, twoFactorClient } from 'better-auth/client/plugins'

/**
 * Better Auth's browser client with the plugins `createAuth` turns on: tokens, emailed codes, two-factor authentication
 * and passkeys. Without its default fetch plugin, which sends the browser to the `url` of any answer with `redirect:
 * true`: the caller goes on itself, as the connect page does, which the OAuth provider sends back to itself to ask.
 */
export const betterAuthClient = (baseURL: string, basePath: string, fetch: typeof globalThis.fetch) =>
  createAuthClient({ baseURL, basePath, plugins: [jwtClient(), emailOTPClient(), twoFactorClient(), passkeyClient()], disableDefaultFetchPlugins: true, fetchOptions: { customFetchImpl: fetch } })

export type BetterAuthClient = ReturnType<typeof betterAuthClient>
