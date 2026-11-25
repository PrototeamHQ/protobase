import { sql } from 'kysely'
import type { ResolvedNames } from '../names/resolve-names'
import type { StoreSql } from '../store/store-sql'
import type { PersonalAccessTokenRow } from './token-store'

// A token's organization while organizations are off after being on: Better Auth's model has no such field then, so
// its column, kept and required, is written and read in SQL, under the name `kept` gives it with organizations on.

/** Stores a token made in the pinned organization `organizationId`, as `storeToken` stores one. */
export const storePinnedToken = async (store: StoreSql, kept: ResolvedNames, data: Omit<PersonalAccessTokenRow, 'id' | 'lastUsedAt'> & { organizationId: string }): Promise<PersonalAccessTokenRow> => {
  const token = kept.table('personal_access_token')
  const c = token.columns
  const [row] = (
    await sql<{ id: string }>`insert into ${token} (id, ${c.user_id}, ${c.name}, ${c.token_hash}, ${c.role}, ${c.organization_id}, ${c.created_at}, ${c.expires_at})
values (${store.newId}, ${data.userId}, ${data.name}, ${data.tokenHash}, ${data.role}, ${data.organizationId}, ${data.createdAt}, ${data.expiresAt ?? null})
returning id::text as id`.execute(store.db)
  ).rows
  return { ...data, id: row!.id, lastUsedAt: null }
}

/** The organization the token `id` was made in, `null` for one made in none, such as one made before tokens kept theirs while organizations were off. */
export const tokenOrganization = async (store: StoreSql, kept: ResolvedNames, id: string) => {
  const token = kept.table('personal_access_token')
  const [row] = (await sql<{ organization_id: string | null }>`select ${token.columns.organization_id}::text as organization_id from ${token} where id = ${id}`.execute(store.db)).rows
  return row?.organization_id ?? null
}
