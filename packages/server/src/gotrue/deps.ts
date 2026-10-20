import type { AdminAuth } from '../better-auth/create-auth'
import type { AuthContext } from '../better-auth/organizations/store'
import type { GoTrueSession } from './session-json'

/** What every group of the GoTrue-compatible endpoints works with. */
export type GoTrueDeps = {
  auth: AdminAuth
  /** Better Auth's context, for its stores. */
  context: () => Promise<AuthContext>
  /** The GoTrue session of the Better Auth session with this token. */
  sessionOf: (sessionToken: string) => Promise<GoTrueSession>
}

export const goTrueDeps = (auth: AdminAuth): GoTrueDeps => ({
  auth,
  context: () => auth.$context as unknown as Promise<AuthContext>,
  sessionOf: (sessionToken) => auth.api.goTrueSession({ body: { sessionToken } }),
})
