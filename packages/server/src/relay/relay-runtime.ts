import type { Db } from '@protobase/query'
import type { AdminAuth } from '../better-auth/create-auth'
import type { ResourceChange } from '../changes/resource-change'
import type { Deps } from '../deps'
import { audienceChannels, changeCommands } from './change-commands'
import { channelMembers } from './members-sql'
import { relayClient } from './relay-commands'
import { relayJobs } from './relay-jobs'
import { relayModels } from './relay-models'
import { checkRelayOptions, type RealtimeRelayOptions } from './relay-options'
import { sessionEnd } from './session-end'
import { ticketRoutes } from './ticket-route'

/**
 * The app's side of the relay: its jobs, the dispatch's hook that hands the relay each batch of changes, and the ticket
 * endpoint. Needs the app's own sign-in, whose sessions the tickets name.
 */
export const relayRuntime = (options: RealtimeRelayOptions, auth: AdminAuth | undefined, deps: Deps) => {
  checkRelayOptions(options)
  if (!auth) throw new Error("relay needs the app's own sign-in (auth), whose sessions its tickets name and end")
  const models = relayModels(options, deps.registry.entries.map((entry) => entry.model))
  const ends = sessionEnd(auth)
  const jobs = relayJobs({ client: relayClient(options), sessionEnd: ends, report: (error) => deps.report(error) })

  // The batch's commands, each change's audience read once from the members tables, in the dispatch's transaction.
  const onChanges = async (trx: Db, changes: readonly ResourceChange[]) => {
    const members = await channelMembers(trx, models, audienceChannels(models, changes))
    await jobs.queue(trx, changeCommands(models, changes, members))
  }

  return { jobs: jobs.jobs, onChanges, routes: () => ticketRoutes({ deps, options, models, jobs, sessionEnd: ends }) }
}
