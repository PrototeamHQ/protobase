import type { BetterAuthOptions } from 'better-auth'
import { sql } from 'kysely'
import { storedId } from '../store/store-reads'

/**
 * The condition that leaves the configured default organization out of a statement on `organization o`, nothing without
 * one. Where the ids are uuids, the id is compared as Postgres prints it, so one written in upper case matches too.
 */
export const notDefaultOrganization = (options: Pick<BetterAuthOptions, 'advanced'>, defaultId: string | undefined) => {
  if (defaultId === undefined) return sql``
  return sql`and cast(o.id as text) <> ${storedId(options, defaultId)}`
}
