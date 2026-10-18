import { anonymousRole } from '@protobase/schema'
import type { AdminOptions } from './admin-options'
import { MissingCredentials } from './problem'
import type { Authenticator, Session } from './types'

/** The user id of a caller without a token: one no signed-in user has, since every verified token names a subject. */
export const anonymousUserId = ''

/** A caller without a token, acting as the `anonymous` role, with no tenant. */
export const anonymousSession = (): Session => ({ user: { id: anonymousUserId, roles: [anonymousRole] }, anonymous: true })

/**
 * With an `anonymous` role in `roles`, a request that carries no credential at all (`MissingCredentials`) is served as
 * a caller holding that role alone; an invalid or expired one is still a 401. Without the role, `authenticate` itself.
 */
export const withAnonymous = (authenticate: Authenticator, roles: AdminOptions['roles']): Authenticator => {
  if (!Object.hasOwn(roles?.definitions ?? {}, anonymousRole)) return authenticate
  return async (request) => {
    try {
      return await authenticate(request)
    } catch (error) {
      if (error instanceof MissingCredentials) return anonymousSession()
      throw error
    }
  }
}

/**
 * Whether visitors browse the admin app without signing in: the anonymous role reads a resource. One that only creates,
 * through public forms, leaves the app behind sign-in.
 */
export const visitorsBrowse = (roles: AdminOptions['roles']) =>
  (roles?.limits ?? []).some(({ role, capability }) => role === anonymousRole && capability.endsWith('.read'))
