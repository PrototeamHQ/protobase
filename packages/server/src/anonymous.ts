import { anonymousRole } from '@protobase/schema'
import type { AdminOptions } from './admin-options'
import { MissingCredentials } from './problem'
import type { Authenticator, Session } from './types'

// No tenant, and an id no signed-in user has: every verified token names a subject.
const anonymousSession = (): Session => ({ user: { id: '', roles: [anonymousRole] }, anonymous: true })

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
