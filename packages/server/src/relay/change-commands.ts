import type { ResourceChange } from '../changes/resource-change'
import type { Row } from '../types'
import type { MembersCommand, PublishCommand, RelayCommand } from './relay-commands'
import { hasMembers, type ListedModel, type MembersModel, type RelayModels } from './relay-models'
import { peopleChannel } from './presence-commands'

/** The event every notice of a change is published as. */
export const changeEvent = 'change'

/** The event that tells a person on `people` of a channel they were added to, so their open pages join it. */
export const joinedEvent = 'joined'

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
  [...new Set(changes.flatMap((change) => noticedChannels(models, change)))].filter((channel) => hasMembers(models.channels.get(channel.slice(0, channel.indexOf('/')))))

/** The open channels, without members, that a batch's notices go to everyone joined to, whose records `publicChannels` reads. */
export const openChannels = (models: RelayModels, changes: readonly ResourceChange[]) =>
  [...new Set(changes.flatMap((change) => noticedChannels(models, change)))].filter((channel) => !hasMembers(models.channels.get(channel.slice(0, channel.indexOf('/')))))

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

/** By organization, its members' user ids, as `membersOf` reads them. */
export type OrganizationMembership = Map<string, string[]>

// Whether one state of a channel record reaches its whole organization: its members field is null, it is not soft-deleted.
const reachesOrganization = (listed: ListedModel, record: Row) =>
  listed.tenant !== undefined && !present(record[listed.field]) && !(listed.model.softDelete !== undefined && present(record[listed.model.softDelete]))

/** The organizations whose members a batch's channel records reach, before or after their change, which `membersOf` reads. */
export const organizationsNoticed = (models: RelayModels, changes: readonly ResourceChange[]) => {
  const found = changes.flatMap((change) => {
    const listed = models.channels.get(change.resource)?.listed
    if (!listed?.tenant) return []
    return [change.before, change.after].flatMap((record) => (record && reachesOrganization(listed, record) && present(record[listed.tenant!]) ? [String(record[listed.tenant!])] : []))
  })
  return [...new Set(found)]
}

// Who a channel record lists in one state of it, and on which channel: its organization's members when it reaches the
// whole organization; a soft-deleted record lists nobody.
const listedIn = (listed: ListedModel, record: Row | undefined, organizations: OrganizationMembership) => {
  if (!record) return
  const value = record[listed.field]
  const deleted = listed.model.softDelete !== undefined && present(record[listed.model.softDelete])
  const users = reachesOrganization(listed, record) ? (organizations.get(String(record[listed.tenant!])) ?? []) : Array.isArray(value) && !deleted ? value.filter(present).map(String) : []
  return { channel: channelName(listed.model.name, record[listed.model.primaryKey[0]!]), users: new Set(users) }
}

const missing = (from: Set<string> | undefined, other: Set<string> | undefined) => [...(from ?? [])].filter((user) => !other?.has(user))

// For a channel record that lists its members: the people its change adds and removes, by diffing who it lists before and after.
const listedCommands = (models: RelayModels, change: ResourceChange, organizations: OrganizationMembership): MembersCommand[] => {
  const listed = models.channels.get(change.resource)?.listed
  if (!listed) return []
  const before = change.operation === 'create' || change.operation === 'undelete' ? undefined : listedIn(listed, change.before, organizations)
  const after = change.operation === 'delete' ? undefined : listedIn(listed, change.after, organizations)
  const moved = before && after && before.channel !== after.channel
  const added = after ? missing(after.users, moved ? undefined : before?.users) : []
  const removed = before ? missing(before.users, moved ? undefined : after?.users) : []
  return [
    ...(added.length > 0 ? [{ kind: 'add', channel: after!.channel, users: added } satisfies MembersCommand] : []),
    ...(removed.length > 0 ? [{ kind: 'remove', channel: before!.channel, users: removed } satisfies MembersCommand] : []),
  ]
}

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
  const users = hasMembers(options) ? [...new Set([...(members.get(channel) ?? []), ...extra])] : undefined
  return {
    kind: 'publish',
    id: `${change.sequence}:${channel}`,
    channel,
    ...(users && { users }),
    event: changeEvent,
    payload: { kind: change.operation, resource: change.resource, key: change.key, channel, ...(mentions !== undefined && { mentions }) },
  }
}

/** Tells only the people added to a channel, on `people`, which channel it is: nobody else learns who joined what. */
export const joinedCommand = (sequence: string, add: MembersCommand): PublishCommand => ({
  kind: 'publish',
  id: `${sequence}:${add.channel}:${joinedEvent}`,
  channel: peopleChannel,
  users: add.users,
  event: joinedEvent,
  payload: { channel: add.channel },
})

// A notice to everyone joined goes out only on a channel whose record is public (`open`); one to people, to someone.
const reaches = (command: PublishCommand, open: ReadonlySet<string>) => (command.users === undefined ? open.has(command.channel) : command.users.length > 0)

/**
 * The relay's commands for a dispatched batch, in commit order: for each change, a person who joins a channel joins it
 * first and hears `joined` of it on `people`, then each channel the record was or is on hears one notice, then a person
 * who left it leaves. A channel with members hears it only through its members as the app's database has them
 * (`members`), and the person who joined or left; an open one through everyone joined to it, and only while its record is public (`open`), so sockets that joined
 * it before hear nothing once it is not. A record that reaches its whole organization, before or after its change,
 * moves its organization's members (`organizations`) as a list moves the people it lists. A notice of a channel with no
 * one to reach is left out.
 */
export const changeCommands = (models: RelayModels, changes: readonly ResourceChange[], members: ChannelMembers, open: ReadonlySet<string>, organizations: OrganizationMembership = new Map()): RelayCommand[] =>
  changes.flatMap((change) => {
    const moved = [...membersCommands(models, change), ...listedCommands(models, change, organizations)]
    const notices = noticedChannels(models, change)
      .map((channel) => notice(models, change, channel, members, moved))
      .filter((command) => reaches(command, open))
    const adds = moved.filter((command) => command.kind === 'add')
    return [...adds.flatMap((add) => [add, joinedCommand(change.sequence, add)]), ...notices, ...moved.filter((command) => command.kind === 'remove')]
  })
