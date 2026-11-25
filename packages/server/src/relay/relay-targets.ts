import type { ResourceModel } from '@protobase/schema'
import type { StoreNames } from '../better-auth/store/store-names'
import type { ModuleInput } from '../schema-modules/schema-module'
import { listedTable } from './realtime-members-sql'
import { relayModels } from './relay-models'
import type { RealtimeRelaySettings } from './relay-options'

/**
 * What the relay module takes from the app for its channels (`appRelayChannels`): the sessions table of the auth store
 * `store` names, as SQL names it, and each channel resource whose records list their members, by its table. Refuses an
 * app without its own sign-in, whose sessions the relay's tickets name and end.
 */
export const relayInput = (channels: RealtimeRelaySettings['channels'], models: readonly ResourceModel[], store: StoreNames | undefined): ModuleInput => {
  if (!store) throw new Error("relay needs the app's own sign-in (auth), whose sessions its tickets name and end")
  const listed = [...relayModels({ channels }, models).channels.values()].flatMap((channel) => (channel.listed ? [channel.listed] : []))
  const members = Object.fromEntries(
    listed.map((one) => {
      const { table } = one.model
      return [one.model.name, { table: { ...(table.schema !== undefined && { schema: table.schema }), name: table.name }, input: listedTable(one) }]
    }),
  )
  return { names: { sessions: String(store.names.table('session')) }, resources: { members } }
}
