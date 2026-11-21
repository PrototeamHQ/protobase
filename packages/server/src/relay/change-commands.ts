import type { ResourceChange } from '../changes/resource-change'
import type { Row } from '../types'
import type { MembersCommand, PublishCommand, RelayCommand } from './relay-commands'
import type { MembersModel, RelayModels } from './relay-models'

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

/** The open channels, without members, that a batch's notices go to everyone joined to, whose records `publicChannels` reads. */
export const openChannels = (models: RelayModels, changes: readonly ResourceChange[]) =>
  [...new Set(changes.flatMap((change) => noticedChannels(models, change)))].filter((channel) => !models.channels.get(channel.slice(0, channel.indexOf('/')))?.members)

type Membership = { channel: string; user: string }
type Members = { channel: string } & MembersModel

// A members record's person in a channel, as one state of it has it; a soft-deleted record puts nobody in one.
const membership = (members: Members, record: Row | undefined): Membership | undefined => {
  if (!record || !present(record[members.field]) || !present(record[members.user])) return
  if (members.model.softDelete !== undefined && present(record[members.model.softDelete])) return
  return { channel: channelName(members.channel, record[members.field]), user: String(record[members.user]) }
}

const sameMembership = (a?: Membership, b?: Membership) => a?.channel === b?.channel && a?.user === b?.user

// For each channel resource the members resource fills: a soft delete takes the person out, an undelete puts them back.
const membersCommands = (models: RelayModels, change: ResourceChange) =>
  (models.members.get(change.resource) ?? []).flatMap((members) => {
    const before = change.operation === 'create' || change.operation === 'undelete' ? undefined : membership(members, change.before)
    const after = change.operation === 'delete' ? undefined : membership(members, change.after)
    if (sameMembership(before, after)) return []
    return [
      ...(after ? [{ kind: 'add', channel: after.channel, users: [after.user] } satisfies MembersCommand] : []),
      ...(before ? [{ kind: 'remove', channel: before.channel, users: [before.user] } satisfies MembersCommand] : []),
    ]
  })

const mentionsOf = (record: Row | undefined, field: string | undefined) => {
  if (field === undefined || !record) return
  const value = record[field]
  if (Array.isArray(value)) return value.filter(present).map(String)
  return present(value) ? [String(value)] : []
}

// One notice of the change on a channel: the same bytes to everyone it reaches, the people who join or leave that channel included.
const notice = (models: RelayModels, change: ResourceChange, channel: string, members: ChannelMembers, moved: MembersCommand[]): PublishCommand => {
  const options = models.channels.get(channel.slice(0, channel.indexOf('/')))!
  const mentions = mentionsOf(change.after ?? change.before, options.mentions)
  const extra = moved.filter((command) => command.channel === channel).flatMap((command) => command.users)
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

// A notice to everyone joined goes out only on a channel whose record is public (`open`); one to people, to someone.
const reaches = (command: PublishCommand, open: ReadonlySet<string>) => (command.users === undefined ? open.has(command.channel) : command.users.length > 0)

/**
 * The relay's commands for a dispatched batch, in commit order: for each change, a person who joins a channel joins it
 * first, then each channel the record was or is on hears one notice, then a person who left it leaves. A channel with
 * members hears it only through its members as the app's database has them (`members`), and the person who joined or
 * left; an open one through everyone joined to it, and only while its record is public (`open`), so sockets that joined
 * it before hear nothing once it is not. A notice of a channel with no one to reach is left out.
 */
export const changeCommands = (models: RelayModels, changes: readonly ResourceChange[], members: ChannelMembers, open: ReadonlySet<string>): RelayCommand[] =>
  changes.flatMap((change) => {
    const moved = membersCommands(models, change)
    const notices = noticedChannels(models, change)
      .map((channel) => notice(models, change, channel, members, moved))
      .filter((command) => reaches(command, open))
    return [...moved.filter((command) => command.kind === 'add'), ...notices, ...moved.filter((command) => command.kind === 'remove')]
  })
