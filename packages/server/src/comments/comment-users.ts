import { sql } from 'kysely'
import type { AdminAuth } from '../better-auth/create-auth'
import type { AuthContext } from '../better-auth/organizations/store'
import { storeSqlOf } from '../better-auth/store/store-sql'
import { betterAuthActorNames } from '../history/actor-names'
import type { TenantValue } from '../types'
import { betterAuthOwnerRoles } from '../webhooks/table/owner-roles'

/** The users comments name, mention and mail: from the project's auth. */
export type CommentUsers = {
  /** The names of these user ids; one who is gone or has none is left out. */
  names(ids: readonly string[]): Promise<Record<string, string>>
  /** Up to `limit` users whose name contains `query`, whatever its case, by name; no banned ones. */
  search(query: string, limit: number): Promise<{ id: string; name: string }[]>
  /** The role the user acts with now in `tenant` (see `betterAuthOwnerRoles`); none when banned or gone. */
  roles(user: { id: string; tenant?: TenantValue }): Promise<string[]>
  /** The address mail to the user goes to; `undefined` when they are banned or gone. */
  email(id: string): Promise<string | undefined>
}

type UserRow = { id: string; name?: string | null; email?: string | null; banned?: boolean | null }

/** The users of a Better Auth instance, read through its adapters only (see `better-auth/users.ts`). */
export const betterAuthCommentUsers = (auth: AdminAuth): CommentUsers => ({
  names: betterAuthActorNames(auth),
  roles: betterAuthOwnerRoles(auth),
  // Only users with a name and no standing ban count towards `limit`, so it is asked of Postgres with them: a ban stands
  // while it has no end or its end is still to come.
  search: async (query, limit) => {
    const store = storeSqlOf((await auth.$context) as unknown as AuthContext)
    const name = store.userColumn('name')
    const now = new Date()
    const contains = query === '' ? sql`` : sql` and ${name} ilike ${`%${query.replace(/[\\%_]/g, '\\$&')}%`}`
    const { rows } = await sql<{ id: string; name: string }>`select id, ${name} as name from ${store.user}
      where ${name} <> '' and not (${store.userColumn('banned')} is true and (${store.userColumn('banExpires')} is null or ${store.userColumn('banExpires')} > ${now}))${contains}
      order by ${name}, id limit ${limit}`.execute(store.db)
    return rows.map((user) => ({ id: String(user.id), name: user.name }))
  },
  email: async (id) => {
    const { internalAdapter } = (await auth.$context) as unknown as AuthContext
    const user = (await internalAdapter.findUserById(id)) as UserRow | null
    return user && !user.banned && user.email ? user.email : undefined
  },
})
