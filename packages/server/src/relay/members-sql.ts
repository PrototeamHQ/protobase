import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent, tableSql } from '../changes/capture-sql'
import { channelName, type ChannelMembers } from './change-commands'
import type { MembersModel, RelayModels } from './relay-models'

const column = (members: MembersModel, field: string) => sql.raw(quoteIdent(members.model.fields[field]!.column))

// A soft-deleted members record puts nobody in a channel.
const live = (members: MembersModel) => {
  const field = members.model.softDelete
  return field === undefined ? sql`true` : sql`${column(members, field)} is null`
}

/**
 * The members of the named channels as the members tables hold them now, one query for each channel resource with
 * members, in the caller's transaction: what the dispatch's notices go to. Its relation column needs an index.
 */
export const channelMembers = async (db: Db, models: RelayModels, channels: readonly string[]): Promise<ChannelMembers> => {
  const found: ChannelMembers = new Map()
  const byResource = new Map<string, string[]>()
  for (const channel of channels) {
    const resource = channel.slice(0, channel.indexOf('/'))
    byResource.set(resource, [...(byResource.get(resource) ?? []), channel])
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

/** The channels with members that the person is in, one query for each channel resource with members; its user column needs an index. */
export const memberships = async (db: Db, models: RelayModels, user: string) => {
  const channels: string[] = []
  for (const [resource, { members }] of models.channels) {
    if (!members) continue
    const { rows } = await sql<{ channel: unknown }>`select distinct ${column(members, members.field)} as channel
      from ${sql.raw(tableSql(members.model))} where ${column(members, members.user)} = ${user} and ${live(members)}`.execute(db)
    channels.push(...rows.map((row) => channelName(resource, row.channel)))
  }
  return channels
}
