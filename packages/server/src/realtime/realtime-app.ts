import type { UpgradeWebSocket } from 'hono/ws'
import type { Caller } from '../api-keys/resolve-caller'
import type { Deps } from '../deps'
import type { NoticeFeed } from '../live/notice-feed'
import { broadcastHub } from './broadcast-hub'
import { changeChecker } from './change-checker'
import { changeHub } from './change-hub'
import { channelAccess } from './channel-access'
import { filterCheck } from './filter-check'
import { databaseBroadcasts } from './database-broadcasts'
import { presenceHub } from './presence-hub'
import { realtimeRoutes } from './realtime-routes'
import { relayed, type RealtimeOptions } from './relay/realtime-options'
import { relayedHubs } from './relay/relayed-hubs'

export type RealtimeAppOptions = {
  deps: Pick<Deps, 'db' | 'registry' | 'statementTimeoutMs'>
  /** The feed `/live` follows too, so a process reads the notices once for both. */
  feed: NoticeFeed
  upgradeWebSocket: UpgradeWebSocket
  caller: (request: Request) => Promise<Caller>
  report: (error: unknown) => void
  options?: RealtimeOptions
}

// The hubs of one process, or of several through the relay, which then reads while a socket is open.
const hubsOf = (deps: RealtimeAppOptions['deps'], options: RealtimeOptions | undefined, report: (error: unknown) => void) => {
  if (relayed(options)) return relayedHubs({ db: deps.db, statementTimeoutMs: deps.statementTimeoutMs, report })
  return { broadcasts: broadcastHub(), presences: presenceHub(), follow: () => () => {} }
}

/**
 * `/api/sb/realtime/v1`: the `postgres_changes` of the live resources, each checked under the subscriber's role, claims and
 * the tables' RLS policies before it is sent, and broadcasts and presence between the channels on a topic, of this
 * process or, with `processes: 'many'`, of every process serving the app, on a
 * private channel as the policies on `realtime.messages` allow, and the broadcasts the database sends with
 * `realtime.send()`.
 */
export const realtimeApp = ({ deps, feed, upgradeWebSocket, caller, report, options }: RealtimeAppOptions) => {
  const live = deps.registry.entries.filter((entry) => entry.model.live)
  const check = changeChecker({ db: deps.db, statementTimeoutMs: deps.statementTimeoutMs, report })
  const hub = changeHub({ feed, check, entry: (resource) => live.find((entry) => entry.name === resource), report })
  const checkFilters = filterCheck({ db: deps.db, statementTimeoutMs: deps.statementTimeoutMs })
  const access = channelAccess({ db: deps.db, statementTimeoutMs: deps.statementTimeoutMs })
  const { broadcasts, presences, follow } = hubsOf(deps, options, report)
  const database = databaseBroadcasts({ db: deps.db, statementTimeoutMs: deps.statementTimeoutMs, broadcasts, report })
  const followed = {
    follow: () => {
      const unfollowRelay = follow()
      const unfollowDatabase = database.follow()
      return () => {
        unfollowDatabase()
        unfollowRelay()
      }
    },
  }
  return realtimeRoutes({ upgradeWebSocket, caller, live, hub, checkFilters, broadcasts, presences, database: followed, access, report })
}
