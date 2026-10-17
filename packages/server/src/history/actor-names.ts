import type { AdminAuth } from '../better-auth/create-auth'
import type { AuthContext } from '../better-auth/organizations/store'

/** The names Better Auth knows of these user ids; a user who is gone, or signed in elsewhere, has none. */
export const betterAuthActorNames = (auth: AdminAuth) => async (ids: readonly string[]) => {
  const { internalAdapter } = (await auth.$context) as unknown as AuthContext
  const users = await Promise.all(ids.map((id) => internalAdapter.findUserById(id) as Promise<{ id: string; name?: string | null } | null>))
  return Object.fromEntries(users.flatMap((user) => (user?.name ? [[user.id, user.name]] : [])))
}
