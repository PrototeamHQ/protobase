import type { Db } from '@protobase/query'
import type { AdminAuth } from '../better-auth/create-auth'
import { dispatchJobName } from '../changes/capture-sql'
import type { ResourceChange } from '../changes/resource-change'
import { anonymousSession } from '../anonymous'
import { readableKeys } from '../channels/records-readable'
import type { Deps } from '../deps'
import { runningJobs } from '../jobs/current'
import { audienceChannels, changeCommands, openChannels } from './change-commands'
import { channelMembers, coMembers } from './members-sql'
import { mergedAudience, organizationAudience, organizationCoMembers } from './organization-audience'
import { organizationMembersOf } from './organization-members'
import { organizationMoves, type MemberPair } from './organization-moves'
import type { PresenceModel } from './presence-model'
import { presenceCommands, presencePeople } from './presence-commands'
import { presenceRoutes } from './presence-route'
import { presenceWriter } from './presence-sql'
import { relayClient } from './relay-commands'
import { relayJobs } from './relay-jobs'
import { relayModels } from './relay-models'
import { publicChannels } from './public-channels'
import type { RealtimeRelaySettings } from './relay-options'
import { sessionEnd } from './session-end'
import { ticketRoutes } from './ticket-route'

/**
 * The app's side of the relay: its jobs, the dispatch's hook that hands the relay each batch of changes, the ticket
 * endpoint and, with presence, the endpoint of the relay's presence reports. Needs the app's
 * own sign-in, whose sessions the tickets name.
 */
export const relayRuntime = (options: RealtimeRelaySettings, auth: AdminAuth | undefined, deps: Deps) => {
  if (!auth) throw new Error("relay needs the app's own sign-in (auth), whose sessions its tickets name and end")
  const models = relayModels(options, deps.registry.entries.map((entry) => entry.model))
  // The auth store's member table, when a channel's records reach their whole organization.
  const organizations = organizationMembersOf(models, auth.names)
  const ends = sessionEnd(auth)
  const moves = async (db: Db, pairs: readonly MemberPair[], id: string) => (organizations ? organizationMoves(db, models, organizations, pairs, id) : [])
  const jobs = relayJobs({ client: relayClient(options), sessionEnd: ends, report: (error) => deps.report(error), moves })

  // The batch's commands, each change's audience read once in the dispatch's transaction: the members tables and the
  // organizations' members, and which open channels' records the anonymous role reads as they stand now, after every
  // change of the batch.
  const onChanges = async (trx: Db, changes: readonly ResourceChange[]) => {
    const channels = audienceChannels(models, changes)
    const wide = await organizationAudience(trx, models, organizations, changes, channels)
    const members = mergedAudience(await channelMembers(trx, models, channels), wide.channels)
    const open = await publicChannels(deps.registry, (entry, keys) => readableKeys(deps, trx, anonymousSession(), entry, keys), openChannels(models, changes))
    const people = presencePeople(models, changes)
    const present = mergedAudience(await coMembers(trx, models, people), await organizationCoMembers(trx, models, organizations, people))
    await jobs.queue(trx, [...changeCommands(models, changes, members, open, wide.organizations), ...presenceCommands(models, changes, present)])
  }

  // A report's records are written, then this process's dispatcher raises their events at once rather than at its next poll.
  const presenceApp = (key: string, presence: PresenceModel) => {
    const write = presenceWriter(deps.db, presence)
    return presenceRoutes({
      key,
      record: async (report) => {
        await write(report)
        runningJobs()?.wake(dispatchJobName)
      },
    })
  }

  // The resources whose changes the relay notices, which pages then hear of from it.
  const noticed = [...models.placements.keys()].sort()

  // What `/meta` names for pages: the noticed resources, and where presence is read, never the reports' key.
  const meta = { resources: noticed, ...(models.presence && { presence: { resource: models.presence.model.name, user: models.presence.user, status: models.presence.status, at: models.presence.at } }) }

  return { jobs: jobs.jobs, onChanges, meta, routes: () => ticketRoutes({ deps, options, models, organizations, jobs, sessionEnd: ends }), ...(options.presence && models.presence && { presenceRoutes: presenceApp(options.presence.key, models.presence) }) }
}
