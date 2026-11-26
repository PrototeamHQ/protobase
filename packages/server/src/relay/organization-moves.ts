import type { Db } from '@protobase/query'
import { channelName, joinedCommand } from './change-commands'
import { organizationChannels } from './organization-channels-sql'
import { organizationResources, organizationsOf, type OrganizationMembers } from './organization-members'
import type { MembersCommand, RelayCommand } from './relay-commands'
import type { RelayModels } from './relay-models'

/** A person whose membership of an organization a statement changed, as the member table's trigger queues them. */
export type MemberPair = { organization: string; user: string }

/**
 * The commands that bring each person's sockets in line with whether they are a member of the organization now, read
 * once: someone who is joins every channel of its records that reach the whole organization and hears `joined` of
 * each on `people`; someone who is not leaves them. `id` makes the `joined` notices' ids, so a retry sends the same.
 */
export const organizationMoves = async (db: Db, models: RelayModels, store: OrganizationMembers, pairs: readonly MemberPair[], id: string): Promise<RelayCommand[]> => {
  const resources = organizationResources(models)
  if (resources.length === 0 || pairs.length === 0) return []
  const current = await organizationsOf(db, store, [...new Set(pairs.map((pair) => pair.user))])
  const { rows } = await organizationChannels(resources, [...new Set(pairs.map((pair) => pair.organization))]).execute(db)
  const channels = new Map<string, string[]>()
  for (const row of rows) channels.set(row.organization, [...(channels.get(row.organization) ?? []), channelName(row.resource, row.channel)])
  // By kind, then channel, the people who join or leave it.
  const moves = { add: new Map<string, Set<string>>(), remove: new Map<string, Set<string>>() }
  for (const { organization, user } of pairs) {
    const kind = current.get(user)?.includes(organization) ? 'add' : 'remove'
    for (const channel of channels.get(organization) ?? []) moves[kind].set(channel, new Set([...(moves[kind].get(channel) ?? []), user]))
  }
  const commands = (kind: 'add' | 'remove') => [...moves[kind]].map(([channel, users]): MembersCommand => ({ kind, channel, users: [...users] }))
  return [...commands('add').flatMap((add) => [add, joinedCommand(id, add)]), ...commands('remove')]
}
