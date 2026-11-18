import { sql } from 'kysely'
import type { AdminAuth } from './create-auth'
import type { AuthContext } from './organizations/store'
import { storeSqlOf, type StoreSql } from './store/store-sql'

/**
 * Which of the sessions with these ids still stand, as Postgres answers it in one join: each live one's id with its
 * user's id. A session signed out, revoked, ended by a newer sign-in in the same browser, or expired is not among them,
 * nor one whose user is banned: a ban deletes the user's sessions, and is read here too, so a session it left still
 * ends. A ban stands while it has no end or its end is still to come. Reads by the session's id, never its token.
 */
export const liveSessionsIn = async (store: StoreSql, ids: readonly string[], now = new Date()) => {
  const live = new Map<string, string>()
  if (ids.length === 0) return live
  const session = store.table('session')
  const { user_id, expires_at } = session.columns
  const user = store.table('user')
  const { banned, ban_expires } = user.columns
  const { rows } = await sql<{ id: string; userId: string }>`select s.id, s.${user_id} as "userId" from ${session} s
    join ${user} u on u.id = s.${user_id}
    where s.id = any(${[...ids]}) and s.${expires_at} > ${now} and not (u.${banned} is true and (u.${ban_expires} is null or u.${ban_expires} > ${now}))`.execute(store.db)
  for (const row of rows) live.set(String(row.id), String(row.userId))
  return live
}

/** `liveSessionsIn` on the store of this Better Auth instance. */
export const liveSessions = (auth: AdminAuth) => async (ids: readonly string[]) => liveSessionsIn(storeSqlOf((await auth.$context) as unknown as AuthContext), ids)
