import type { Kysely } from 'kysely'
import type { PlatformSignIn } from '../../src/better-auth/platform-sign-in'
import { startFakeOidcProvider } from './fake-oidc-provider'
import { client, octo, servePlatformApp, type PlatformApp } from './platform-sign-in-app'
import type { SnapshotDb } from '../../../../test-support/sql-snapshot'

export const centralIssuer = 'https://id.central.example'
export const centralClient = { clientId: client.clientId, clientSecret: 'central-client-secret' }

/** Octo's claims, each with a token id of its own; `reset` starts the ids over, so each test gets the same ones. */
export const tokenClaims = () => {
  let tokens = 0
  return {
    reset: () => {
      tokens = 0
    },
    claims: (changes: Record<string, unknown> = {}) => octo({ jti: `token-${++tokens}`, ...changes }),
  }
}

/**
 * The platform's first provider, `github`, beside `central`, whose tokens are for the same audience, so only the
 * issuer and keys tell them apart; `central` changes the second one's settings.
 */
export const serveTwoProviders = async (shared: SnapshotDb, appDb: Kysely<any>, central: Partial<PlatformSignIn> = {}, options: PlatformApp = {}) => {
  const second = await startFakeOidcProvider({ issuer: centralIssuer, client: centralClient })
  const app = await servePlatformApp(shared, appDb, { tokenSignIn: true, more: [{ issuer: centralIssuer, clientId: centralClient.clientId, provider: 'central', name: 'Central', tokenSignIn: true, ...central }], ...options })
  const postToken = (provider: string, token: string, cookie?: string) => app.request('/sign-in/social', { body: { provider, idToken: { token } }, ...(cookie && { cookie }) })
  return { ...app, central: second, postToken }
}
