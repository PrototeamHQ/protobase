import type { TenantValue } from '../types'
import { betterAuthAuthenticator, type BetterAuthAuthenticatorOptions } from './authenticator'
import type { AdminAuth } from './create-auth'

/**
 * `authenticate` in `protobase.config.ts`: how the API verifies the app's tokens, as data. Without it, the tokens of
 * the app's own `auth`; `jwksUrl` and `issuer` verify those of an auth server elsewhere instead.
 */
export type AuthenticateSettings = Omit<BetterAuthAuthenticatorOptions, 'auth' | 'tenant'> & {
  /** The one tenant everyone works in, for an app without organizations; never read from the token. */
  tenant?: TenantValue
}

/** The authenticator of the `authenticate` settings, over the app's Better Auth when it has one. */
export const buildAuthenticator = (settings: AuthenticateSettings = {}, auth?: AdminAuth) => {
  if (!auth && !settings.jwksUrl) throw new Error('No authenticator: give the config `auth`, or `authenticate.jwksUrl` and `issuer` for an auth server elsewhere; see https://docs.protobase.net/reference/auth/')
  return betterAuthAuthenticator({ ...settings, ...(auth && { auth }) })
}
