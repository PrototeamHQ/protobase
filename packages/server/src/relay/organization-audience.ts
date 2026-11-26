import type { Db } from '@protobase/query'
import type { ResourceChange } from '../changes/resource-change'
import { channelName, organizationsNoticed, type ChannelMembers, type OrganizationMembership } from './change-commands'
import { organizationChannels, organizationsReached, organizationWide } from './organization-channels-sql'
import { membersOf, organizationResources, organizationsOf, type OrganizationMembers } from './organization-members'
import type { CoMembers } from './presence-commands'
import type { RelayModels } from './relay-models'

// The channel records that reach their whole organization reach it through the auth store's member table, which
// `realtime.members` does not hold: each read below takes the member table once, by its index, and the channel tables
// once each, by key or by tenant.

/** What a batch's notices need of the organizations: the members of the named channels that reach theirs, and of each organization concerned. */
export type OrganizationAudience = { channels: ChannelMembers; organizations: OrganizationMembership }

const none = (): OrganizationAudience => ({ channels: new Map(), organizations: new Map() })

/**
 * Of the named channels, those whose records reach their whole organization as they stand now, with its members; and
 * the members of every organization the batch's records reach before or after their change, in the caller's
 * transaction.
 */
export const organizationAudience = async (db: Db, models: RelayModels, store: OrganizationMembers | undefined, changes: readonly ResourceChange[], channels: readonly string[]): Promise<OrganizationAudience> => {
  const resources = organizationResources(models)
  if (!store || resources.length === 0) return none()
  const named = resources.flatMap(([resource, listed]) => {
    const keys = channels.filter((channel) => channel.startsWith(`${resource}/`)).map((channel) => channel.slice(resource.length + 1))
    return keys.length > 0 ? [{ resource, listed, keys }] : []
  })
  const wide = named.length > 0 ? (await organizationWide(named).execute(db)).rows : []
  const organizations = await membersOf(db, store, [...new Set([...wide.map((row) => row.organization), ...organizationsNoticed(models, changes)])])
  return { channels: new Map(wide.map((row) => [channelName(row.resource, row.channel), organizations.get(row.organization) ?? []])), organizations }
}

/** The channels whose records reach a whole organization the person is a member of: what their ticket lists beside their listed channels. */
export const organizationMemberships = async (db: Db, models: RelayModels, store: OrganizationMembers | undefined, user: string) => {
  const resources = organizationResources(models)
  if (!store || resources.length === 0) return []
  const organizations = (await organizationsOf(db, store, [user])).get(user) ?? []
  if (organizations.length === 0) return []
  const { rows } = await organizationChannels(resources, organizations).execute(db)
  return rows.map((row) => channelName(row.resource, row.channel))
}

/**
 * By person, the members of each organization of theirs with a channel that reaches it, themselves included: who
 * shares such a channel with them, and so hears of their presence.
 */
export const organizationCoMembers = async (db: Db, models: RelayModels, store: OrganizationMembers | undefined, people: readonly string[]): Promise<CoMembers> => {
  const found: CoMembers = new Map()
  const resources = organizationResources(models)
  if (!store || resources.length === 0 || people.length === 0) return found
  const theirs = await organizationsOf(db, store, people)
  const organizations = [...new Set([...theirs.values()].flat())]
  if (organizations.length === 0) return found
  const { rows } = await organizationsReached(resources, organizations).execute(db)
  const reached = await membersOf(db, store, rows.map((row) => row.organization))
  for (const [person, joined] of theirs) {
    const others = joined.flatMap((organization) => reached.get(organization) ?? [])
    if (others.length > 0) found.set(person, others)
  }
  return found
}

/** Two audiences by key as one, each key's people once. */
export const mergedAudience = (a: Map<string, string[]>, b: Map<string, string[]>) => {
  const merged = new Map(a)
  for (const [key, people] of b) merged.set(key, [...new Set([...(merged.get(key) ?? []), ...people])])
  return merged
}
