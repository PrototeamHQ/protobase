import { passkeyClient } from '@better-auth/passkey/client'
import { createAuthClient } from 'better-auth/client'
import { emailOTPClient, jwtClient, twoFactorClient } from 'better-auth/client/plugins'

/** Better Auth's browser client with the plugins `createAuth` turns on: tokens, emailed codes, two-factor authentication and passkeys. */
export const betterAuthClient = (baseURL: string, basePath: string, fetch: typeof globalThis.fetch) =>
  createAuthClient({ baseURL, basePath, plugins: [jwtClient(), emailOTPClient(), twoFactorClient(), passkeyClient()], fetchOptions: { customFetchImpl: fetch } })

export type BetterAuthClient = ReturnType<typeof betterAuthClient>
