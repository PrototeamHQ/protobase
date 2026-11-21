import type { ResourceChange } from '../changes/resource-change'
import type { Row } from '../types'
import type { MembersCommand, PublishCommand, RelayCommand } from './relay-commands'
import type { RelayModels } from './relay-models'

/** The event every notice of a change is published as. */
export const changeEvent = 'change'

/** A channel by name: `<resource>/<key>`, as the record channels name it too. */
export const channelName = (resource: string, key: unknown) => `${resource}/${String(key)}`

/** The members of the named channels, by channel name; a channel with none is missing or empty. */
export type ChannelMembers = Map<string, string[]>

const present = (value: unknown) => value !== null && value !== undefined

// The channels a record sits on in one state of it: one for each placing field with a value.
const channelsOf = (models: RelayModels, resource: string, record: Row | undefined) =>
  (models.placements.get(resource) ?? []).flatMap(({ field, channel }) => (record && present(record[field]) ? [channelName(channel, record[field])] : []))

/** The channels a change is noticed on: where the record was and where it is, each once. */
export const noticedChannels = (models: RelayModels, change: ResourceChange) => [...new Set([...channelsOf(models, change.resource, change.before), ...channelsOf(models, change.resource, change.after)])]

/** The channels with members whose people a batch's notices go to, which `channelMembers` reads. */
export const audienceChannels = (models: RelayModels, changes: readonly ResourceChange[]) =>
  [...new Set(changes.flatMap((change) => noticedChannels(models, change)))].filter((channel) => models.channels.get(channel.slice(0, channel.indexOf('/')))?.members)

// A members record's person in a channel, as one state of it has it.
const membership = (models: RelayModels, change: ResourceChange, record: Row | undefined) => {
  const members = models.members.get(change.resource)
  if (!members || !record || !present(record[members.field]) || !present(record[members.user])) return
  return { channel: channelName(members.channel, record[members.field]), user: String(record[members.user]) }
}

const sameMembership = (a?: { channel: string; user: string }, b?: { channel: string; user: string }) => a?.channel === b?.channel && a?.user === b?.user

// A soft delete takes the person out, an undelete puts them back.
const membersCommands = (models: RelayModels, change: ResourceChange): { add?: MembersCommand; remove?: MembersCommand } => {
  const gone = change.operation === 'delete'
  const before = change.operation === 'create' || change.operation === 'undelete' ? undefined : membership(models, change, change.before)
  const after = gone ? undefined : membership(models, change, change.after)
  if (sameMembership(before, after)) return {}
  return {
    ...(after && { add: { kind: 'add', channel: after.channel, users: [after.user] } }),
    ...(before && { remove: { kind: 'remove', channel: before.channel, users: [before.user] } }),
  }
}

const mentionsOf = (record: Row | undefined, field: string | undefined) => {
  if (field === undefined || !record) return
  const value = record[field]
  if (Array.isArray(value)) return value.filter(present).map(String)
  return present(value) ? [String(value)] : []
}

// One notice of the change on a channel: the same bytes to everyone it reaches.
const notice = (models: RelayModels, change: ResourceChange, channel: string, members: ChannelMembers, extra: string[]): PublishCommand => {
  const options = models.channels.get(channel.slice(0, channel.indexOf('/')))!
  const mentions = mentionsOf(change.after ?? change.before, options.mentions)
  const users = options.members ? [...new Set([...(members.get(channel) ?? []), ...extra])] : undefined
  return {
    kind: 'publish',
    id: `${change.sequence}:${channel}`,
    channel,
    ...(users && { users }),
    event: changeEvent,
    payload: { kind: change.operation, resource: change.resource, key: change.key, channel, ...(mentions !== undefined && { mentions }) },
  }
}

/**
 * The relay's commands for a dispatched batch, in commit order: for each change, a person who joins a channel joins it
 * first, then each channel the record was or is on hears one notice, then a person who left it leaves. A channel with
 * members hears it only through its members as the app's database has them (`members`), and the person who joined or
 * left; an open one through everyone joined to it. A notice of a channel with no one to reach is left out.
 */
export const changeCommands = (models: RelayModels, changes: readonly ResourceChange[], members: ChannelMembers): RelayCommand[] =>
  changes.flatMap((change) => {
    const { add, remove } = membersCommands(models, change)
    const moved = [...(add?.users ?? []), ...(remove?.users ?? [])]
    const notices = noticedChannels(models, change)
      .map((channel) => notice(models, change, channel, members, moved))
      .filter((command) => command.users === undefined || command.users.length > 0)
    return [...(add ? [add] : []), ...notices, ...(remove ? [remove] : [])]
  })
