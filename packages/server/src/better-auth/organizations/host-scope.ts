import { isEveryOrganization, type EveryOrganization, type Organization } from '@protobase/query'
import type { ResolvedTable } from '../names/resolve-names'
import type { StoreSql } from '../store/store-sql'

/**
 * Where a host function works: one organization, by its id, or every one (`everyOrganization('<reason>')`), the reviewed
 * way out that its caller names, such as `protobase organizations list --all-organizations`.
 */
export type HostScope = Organization | EveryOrganization

/** A table of the store as Kysely's builder names it: `schema.table`, or the table alone where the search path finds it. */
export const builderName = (table: ResolvedTable) => (table.schema === undefined ? table.name : `${table.schema}.${table.name}`)

/**
 * A table of the store whose rows belong to one organization, for raw SQL in `scope`: the table itself across every
 * organization, or the organization's rows, a query of Kysely's builder that names it, so a store kept to the
 * organization (`ScopedDb`) checks it too, while one without the scope, such as a pg Pool's, reads it as written.
 */
export const rowsIn = (store: StoreSql, scope: HostScope, table: ResolvedTable<'organization_id'>) => {
  if (isEveryOrganization(scope)) return table
  return store.db.selectFrom(builderName(table)).selectAll().where(table.columns.organization_id.name, '=', scope)
}
