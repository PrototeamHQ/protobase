import { sql } from 'kysely'
import { unscoped, type Db } from '@protobase/query'
import type { ResolvedNames } from '../better-auth/names/resolve-names'
import { quoteIdent } from '../changes/capture-sql'
import type { ListedModel, RelayModels } from './relay-models'

/** The auth store's member table as the relay reads who is in each organization: `schema.table`, and its columns. */
export type OrganizationMembers = { table: string; organization: string; user: string }

// The relay reaches the members of whichever organizations a batch's channels are in, so it reads every organization's rows.
const everyOrganization = 'the relay reaches the members of the organizations its channels are in'

/** The channel resources whose records with a null members field reach their organization, each with its listed model. */
export const organizationResources = (models: RelayModels) =>
  [...models.channels].flatMap(([resource, channel]) => (channel.listed?.tenant ? [[resource, channel.listed] as [string, ListedModel]] : []))

/**
 * The member table of the store's names when a channel reaches an organization, else undefined; refuses such a channel
 * while organizations are off, as there are no members to reach.
 */
export const organizationMembersOf = (models: RelayModels, names: ResolvedNames | undefined): OrganizationMembers | undefined => {
  const [first] = organizationResources(models)
  if (!first) return
  const member = names?.tables.member
  if (!member) throw new Error(`realtime.relay.channels.${first[0]}.members.organization needs organizations (auth.organizations), whose members it reaches`)
  return { table: member.schema === undefined ? member.name : `${member.schema}.${member.name}`, organization: member.columns.organization_id!.name, user: member.columns.user_id!.name }
}

const column = (name: string) => sql.raw(quoteIdent(name))

const grouped = (rows: ReadonlyArray<{ by: string; value: string }>) => {
  const found = new Map<string, string[]>()
  for (const row of rows) found.set(row.by, [...(found.get(row.by) ?? []), row.value])
  return found
}

/** By organization, the user ids of its members, through the member table's index by organization. */
export const membersOf = async (db: Db, store: OrganizationMembers, organizations: readonly string[]) => {
  if (organizations.length === 0) return new Map<string, string[]>()
  const { rows } = await sql<{ by: string; value: string }>`select ${column(store.organization)}::text as by, ${column(store.user)}::text as value
    from ${unscoped(everyOrganization, store.table)} where ${column(store.organization)} = any(${organizations})`.execute(db)
  return grouped(rows)
}

/** By person, the organizations they are a member of, through the member table's index by user. */
export const organizationsOf = async (db: Db, store: OrganizationMembers, users: readonly string[]) => {
  if (users.length === 0) return new Map<string, string[]>()
  const { rows } = await sql<{ by: string; value: string }>`select ${column(store.user)}::text as by, ${column(store.organization)}::text as value
    from ${unscoped(everyOrganization, store.table)} where ${column(store.user)} = any(${users})`.execute(db)
  return grouped(rows)
}
