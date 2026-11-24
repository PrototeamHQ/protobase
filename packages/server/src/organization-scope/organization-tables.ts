import type { Organization, ScopedTables } from '@protobase/query'
import type { ResolvedNames } from '../better-auth/names/resolve-names'
import type { Session } from '../types'

/**
 * The store's tables whose rows each belong to one organization, under the names the app gives them, on their
 * `organization_id`: `member`, `invitation` and `personal_access_token` while organizations are on, none otherwise.
 */
export const organizationTables = (names: ResolvedNames | undefined): ScopedTables => ({
  tables: Object.values(names?.tables ?? {}).flatMap((table) => {
    const column = table.columns.organization_id
    if (table.scope !== 'organization' || !column) return []
    return [{ ...(table.schema !== undefined && { schema: table.schema }), table: table.name, column: column.name }]
  }),
})

/** No scoped table: the scope of an app without organizations. */
export const noOrganizationTables: ScopedTables = { tables: [] }

/** The organization a session works in: its active one, with organizations on; none for anyone else. */
export const sessionOrganization = (session: Session | undefined): Organization => session?.organization?.id
