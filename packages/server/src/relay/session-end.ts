import { sql } from 'kysely'
import type { AdminAuth } from '../better-auth/create-auth'
import type { AuthContext } from '../better-auth/organizations/store'
import { storeSqlOf } from '../better-auth/store/store-sql'

/** When the sign-in session with this id expires, or `undefined` when it is gone; read by its id, never its token. */
export const sessionEnd = (auth: AdminAuth) => async (id: string) => {
  const store = storeSqlOf((await auth.$context) as unknown as AuthContext)
  const session = store.table('session')
  const { rows } = await sql<{ expires: Date }>`select ${session.columns.expires_at} as expires from ${session} where id = ${id}`.execute(store.db)
  const expires = rows[0]?.expires
  return expires === undefined ? undefined : new Date(expires)
}

/** The sign-in sessions table, as SQL names it. */
export const sessionsTable = (auth: AdminAuth) => String(auth.names.table('session'))
