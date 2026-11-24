import { sql, type Kysely } from 'kysely'
import type { TenantValue } from '../../types'
import { allModules } from '../names/modules-on'
import { resolveNames, type ResolvedNames } from '../names/resolve-names'
import type { DefaultOrganization } from './options'

// Organizations turned off after being on: the store keeps their tables, and the default organization stands in for
// every one of them, pinned by `authenticate.tenant`.

/** What the config says of organizations while they are off: the default organization, and the tenant it is pinned by. */
export type OrganizationsOff = { default?: DefaultOrganization; existingUsersRole?: string; tenant?: TenantValue }

/** The organization everyone works in while organizations are off after being on, and the app role people who join then hold there. */
export type PinnedOrganization = { id: string; existingUsersRole?: string }

/** The store's names with organizations on, as the tables they kept are named. */
export const keptNames = (names: ResolvedNames) => resolveNames({ ...names.input, modules: allModules.filter((module) => module === 'organizations' || names.modules.includes(module)) })

/** Why the server refuses to start once it finds the store holds organizations, or `undefined` when the config pins the default organization. */
export const pinRefusal = (off: OrganizationsOff): string | undefined => {
  if (!off.default) return 'The auth store keeps the tables of organizations, which were on: give auth.organizations.default the organization that stands in for every one while they are off'
  if (off.tenant !== off.default.id) {
    return `Organizations were on and are off, so only the default organization works: set authenticate.tenant to its id, ${JSON.stringify(off.default.id)}, which is ${off.tenant === undefined ? 'unset' : JSON.stringify(off.tenant)}`
  }
  return
}

/** The organization pinned while organizations are off after being on, read from the store (`pinnedOrganization`). */
export type PinRead = () => Promise<PinnedOrganization | undefined>

/**
 * The organization pinned while organizations are off after being on, which the store says by still holding
 * organizations: `undefined` when it has no organization table, or no row in it, as a store from before organizations
 * were a module of their own has, which made their tables whether they were on or not. A store that holds one is
 * refused without `default`, or with `tenant` other than its id (`pinRefusal`).
 */
export const pinnedOrganization = async (db: Kysely<any>, names: ResolvedNames, off: OrganizationsOff): Promise<PinnedOrganization | undefined> => {
  const plain = db.withoutPlugins()
  const organization = keptNames(names).table('organization')
  const [table] = (await sql<{ kept: boolean }>`select to_regclass(${String(organization)}) is not null as kept`.execute(plain)).rows
  if (!table?.kept) return
  const [rows] = (await sql<{ held: boolean }>`select exists (select from ${organization}) as held`.execute(plain)).rows
  if (!rows?.held) return
  const refusal = pinRefusal(off)
  if (refusal) throw new Error(refusal)
  return { id: off.default!.id, ...(off.existingUsersRole !== undefined && { existingUsersRole: off.existingUsersRole }) }
}

/**
 * `pinnedOrganization`, read once its first caller asks, such as the server's startup checks, and kept: the store's
 * tables only change with a migration, which the server restarts after. A failed read is not kept, so the next asks again.
 */
export const pinOnce = (db: Kysely<any>, names: ResolvedNames, off: OrganizationsOff): PinRead => {
  let read: Promise<PinnedOrganization | undefined> | undefined
  return () => {
    read ??= pinnedOrganization(db, names, off).catch((error: unknown) => {
      read = undefined
      throw error
    })
    return read
  }
}
