import type { ResourceModel } from '@protobase/schema'
import type { ResolvedTable } from '../better-auth/names/resolve-names'
import type { StoreNames } from '../better-auth/store/store-names'
import type { ModuleInput } from '../schema-modules/schema-module'
import { organizationMembersOf } from './organization-members'
import type { MemberTable } from './organization-members-sql'
import { listedTable } from './realtime-members-sql'
import { relayModels } from './relay-models'
import type { RealtimeRelaySettings } from './relay-options'

// The member table the organization trigger stands on, and the columns it reads.
const memberInput = (table: ResolvedTable) => {
  const input: MemberTable = { table: String(table), organization: table.columns.organization_id!.name, user: table.columns.user_id!.name }
  return { table: { ...(table.schema !== undefined && { schema: table.schema }), name: table.name }, input }
}

/**
 * What the relay module takes from the app for its channels (`appRelayChannels`): the sessions table of the auth store
 * `store` names, as SQL names it, each channel resource whose records list their members, by its table, and the store's
 * member table under `member` when a channel's records reach their whole organization. Refuses an app without its own
 * sign-in, whose sessions the relay's tickets name and end, and organization-wide channels without organizations.
 */
export const relayInput = (channels: RealtimeRelaySettings['channels'], models: readonly ResourceModel[], store: StoreNames | undefined): ModuleInput => {
  if (!store) throw new Error("relay needs the app's own sign-in (auth), whose sessions its tickets name and end")
  const relay = relayModels({ channels }, models)
  const listed = [...relay.channels.values()].flatMap((channel) => (channel.listed ? [channel.listed] : []))
  const members = Object.fromEntries(
    listed.map((one) => {
      const { table } = one.model
      return [one.model.name, { table: { ...(table.schema !== undefined && { schema: table.schema }), name: table.name }, input: listedTable(one) }]
    }),
  )
  const organization = organizationMembersOf(relay, store.names) && { organization: { member: memberInput(store.names.table('member')) } }
  return { names: { sessions: String(store.names.table('session')) }, resources: { members, ...organization } }
}
