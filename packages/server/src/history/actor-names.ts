import type { AdminAuth } from '../better-auth/create-auth'
import type { AuthContext } from '../better-auth/organizations/store'
import { mayBeId } from '../better-auth/store/store-reads'

/** The names Better Auth knows of these user ids, read in one go; a user who is gone, or signed in elsewhere, has none. */
export const betterAuthActorNames = (auth: AdminAuth) => async (ids: readonly string[]) => {
  const { adapter, options } = (await auth.$context) as unknown as AuthContext
  const asked = [...new Set(ids)].filter((id) => mayBeId(options, id))
  if (asked.length === 0) return {}
  const users = await adapter.findMany<{ id: string; name?: string | null }>({ model: 'user', where: [{ field: 'id', operator: 'in', value: asked }], select: ['id', 'name'], limit: asked.length })
  return Object.fromEntries(users.flatMap((user) => (user.name ? [[user.id, user.name]] : [])))
}
