import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import type { AdminAuth } from '../better-auth/create-auth'
import { migrationCommand } from '../changes/capture-schema'
import { listedTable } from './realtime-members-sql'
import { checkRealtimeMembers, realtimeMembersMigration } from './realtime-members-schema'
import { relayModels } from './relay-models'
import type { RealtimeRelaySettings } from './relay-options'
import { sessionsTable } from './session-end'
import { checkRelaySessions, relaySessionsMigration } from './sessions-sql'

const needsAuth = (auth: AdminAuth | undefined) => {
  if (!auth) throw new Error("relay needs the app's own sign-in (auth), whose sessions its tickets name and end")
  return auth
}

// The tables of the channel resources whose records list their members, as `relayModels` checks them.
const listedTables = (channels: RealtimeRelaySettings['channels'], models: readonly ResourceModel[]) =>
  [...relayModels({ channels }, models).channels.values()].flatMap((channel) => (channel.listed ? [listedTable(channel.listed)] : []))

/**
 * The SQL the relay needs of the app's database, for its channels (`appRelayChannels`): the trigger that closes a
 * deleted session's sockets, and `realtime.members` with the triggers that keep it from the channel records that list
 * their members; `undefined` when it is current. `authWritten`: the same migration writes the auth store's steps before it.
 */
export const relayMigration = async (db: Db, auth: AdminAuth | undefined, authWritten: boolean, channels: RealtimeRelaySettings['channels'], models: readonly ResourceModel[]) => {
  const sessions = await relaySessionsMigration(db, sessionsTable(needsAuth(auth)), authWritten)
  const members = await realtimeMembersMigration(db, listedTables(channels, models))
  const parts = [sessions, members].filter((part) => part !== undefined)
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

/** Refuses to start while the relay's trigger, or `realtime.members` and its triggers, are missing or out of date. */
export const checkRelaySchema = async (db: Db, auth: AdminAuth | undefined, channels: RealtimeRelaySettings['channels'], models: readonly ResourceModel[]) => {
  await checkRelaySessions(db, sessionsTable(needsAuth(auth)))
  await checkRealtimeMembers(db, listedTables(channels, models), migrationCommand)
}
