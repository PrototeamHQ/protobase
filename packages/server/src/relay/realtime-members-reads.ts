import { sql } from 'kysely'
import { realtimeMembersTable } from './realtime-members-sql'
import type { RelayModels } from './relay-models'

const members = sql.raw(realtimeMembersTable)

/** The channel resources whose records list their members, which `realtime.members` holds. */
export const listedResources = (models: RelayModels) => [...models.channels].flatMap(([resource, channel]) => (channel.listed ? [resource] : []))

/** Who is in the named channels of each resource, by the table's key. */
export const listedAudience = (named: ReadonlyArray<{ resource: string; keys: string[] }>) =>
  sql<{ resource: string; channel: string; user: string }>`${sql.join(
    named.map(({ resource, keys }) => sql`select resource, channel_key as channel, user_id as "user" from ${members} where resource = ${resource} and channel_key = any(${keys}::text[])`),
    sql` union all `,
  )}`

/** The channels of these resources the person is in, by the index by person. */
export const listedMemberships = (resources: readonly string[], user: string) =>
  sql<{ resource: string; channel: string }>`select resource, channel_key as channel from ${members} where user_id = ${user} and resource = any(${resources}::text[])`

/** Each of these people with everyone who shares a channel of these resources with them, themselves included. */
export const listedCoMembers = (resources: readonly string[], people: readonly string[]) =>
  sql<{ person: string; other: string }>`select a.user_id as person, b.user_id as other from ${members} a
    join ${members} b on b.resource = a.resource and b.channel_key = a.channel_key
    where a.user_id = any(${people}::text[]) and a.resource = any(${resources}::text[])`
