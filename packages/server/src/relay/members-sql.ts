import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent, tableSql } from '../changes/capture-sql'
import { channelName, type ChannelMembers } from './change-commands'
import type { CoMembers } from './presence-commands'
import { listedAudience, listedCoMembers, listedMemberships, listedResources } from './realtime-members-reads'
import type { MembersModel, RelayModels } from './relay-models'

const column = (members: MembersModel, field: string) => sql.raw(quoteIdent(members.model.fields[field]!.column))

// A soft-deleted members record puts nobody in a channel.
const live = (members: MembersModel) => {
  const field = members.model.softDelete
  return field === undefined ? sql`true` : sql`${column(members, field)} is null`
}

/**
 * The members of the named channels as the members tables and `realtime.members` hold them now, one query for each
 * channel resource with a members resource and one for those whose records list their members, in the caller's
 * transaction: what the dispatch's notices go to. A members resource's relation column needs an index.
 */
export const channelMembers = async (db: Db, models: RelayModels, channels: readonly string[]): Promise<ChannelMembers> => {
  const found: ChannelMembers = new Map()
  const byResource = new Map<string, string[]>()
  for (const channel of channels) {
    const resource = channel.slice(0, channel.indexOf('/'))
    byResource.set(resource, [...(byResource.get(resource) ?? []), channel])
  }
  const listed = [...byResource].filter(([resource]) => models.channels.get(resource)?.listed)
  if (listed.length > 0) {
    const { rows } = await listedAudience(listed.map(([resource, named]) => ({ resource, keys: named.map((channel) => channel.slice(resource.length + 1)) }))).execute(db)
    for (const row of rows) {
      const channel = channelName(row.resource, row.channel)
      found.set(channel, [...(found.get(channel) ?? []), row.user])
    }
  }
  for (const [resource, named] of byResource) {
    const members = models.channels.get(resource)?.members
    if (!members) continue
    const keys = named.map((channel) => channel.slice(resource.length + 1))
    const { rows } = await sql<{ channel: unknown; user: unknown }>`select ${column(members, members.field)} as channel, ${column(members, members.user)} as "user"
      from ${sql.raw(tableSql(members.model))} where ${column(members, members.field)} = any(${keys}) and ${live(members)}`.execute(db)
    for (const row of rows) {
      const channel = channelName(resource, row.channel)
      found.set(channel, [...(found.get(channel) ?? []), String(row.user)])
    }
  }
  return found
}

/**
 * The channels with members that the person is in: one query for each channel resource with a members resource, whose
 * user column needs an index, and one of `realtime.members` for those whose records list their members.
 */
export const memberships = async (db: Db, models: RelayModels, user: string) => {
  const channels: string[] = []
  const listed = listedResources(models)
  if (listed.length > 0) {
    const { rows } = await listedMemberships(listed, user).execute(db)
    channels.push(...rows.map((row) => channelName(row.resource, row.channel)))
  }
  for (const [resource, { members }] of models.channels) {
    if (!members) continue
    const { rows } = await sql<{ channel: unknown }>`select distinct ${column(members, members.field)} as channel
      from ${sql.raw(tableSql(members.model))} where ${column(members, members.user)} = ${user} and ${live(members)}`.execute(db)
    channels.push(...rows.map((row) => channelName(resource, row.channel)))
  }
  return channels
}

const aliased = (alias: string, members: MembersModel, field: string) => sql.raw(`${alias}.${quoteIdent(members.model.fields[field]!.column)}`)

const liveAs = (alias: string, members: MembersModel) => {
  const field = members.model.softDelete
  return field === undefined ? sql`true` : sql`${aliased(alias, members, field)} is null`
}

/**
 * By person, everyone who shares a channel with members with them, themselves included, in one query over every
 * members table and `realtime.members`, in the caller's transaction: who hears of their presence. Its user and
 * relation columns need indexes.
 */
export const coMembers = async (db: Db, models: RelayModels, people: readonly string[]): Promise<CoMembers> => {
  const found: CoMembers = new Map()
  const tables = [...models.channels.values()].flatMap(({ members }) => (members ? [members] : []))
  const listed = listedResources(models)
  if (people.length === 0 || (tables.length === 0 && listed.length === 0)) return found
  const pairs = [...(listed.length > 0 ? [listedCoMembers(listed, people)] : []), ...tables.map(
    (members) => sql`select ${aliased('a', members, members.user)}::text as person, ${aliased('b', members, members.user)}::text as other
      from ${sql.raw(tableSql(members.model))} a join ${sql.raw(tableSql(members.model))} b on ${aliased('b', members, members.field)} = ${aliased('a', members, members.field)}
      where ${aliased('a', members, members.user)} = any(${people}) and ${liveAs('a', members)} and ${liveAs('b', members)}`,
  )]
  const { rows } = await sql<{ person: string; other: string }>`${sql.join(pairs, sql` union `)}`.execute(db)
  for (const row of rows) found.set(row.person, [...(found.get(row.person) ?? []), row.other])
  return found
}
