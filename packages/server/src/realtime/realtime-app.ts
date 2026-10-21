import type { UpgradeWebSocket } from 'hono/ws'
import type { Caller } from '../api-keys/resolve-caller'
import type { Deps } from '../deps'
import type { NoticeFeed } from '../live/notice-feed'
import { changeChecker } from './change-checker'
import { changeHub } from './change-hub'
import { realtimeRoutes } from './realtime-routes'

export type RealtimeAppOptions = {
  deps: Pick<Deps, 'db' | 'registry' | 'statementTimeoutMs'>
  /** The feed `/live` follows too, so a process reads the notices once for both. */
  feed: NoticeFeed
  upgradeWebSocket: UpgradeWebSocket
  caller: (request: Request) => Promise<Caller>
  report: (error: unknown) => void
}

/**
 * `/api/sb/realtime/v1`: the `postgres_changes` of the live resources, each checked under the subscriber's role, claims and
 * the tables' RLS policies before it is sent, and broadcasts and presence between the channels of the process.
 */
export const realtimeApp = ({ deps, feed, upgradeWebSocket, caller, report }: RealtimeAppOptions) => {
  const live = deps.registry.entries.filter((entry) => entry.model.live)
  const check = changeChecker({ db: deps.db, statementTimeoutMs: deps.statementTimeoutMs, report })
  const hub = changeHub({ feed, check, entry: (resource) => live.find((entry) => entry.name === resource), report })
  return realtimeRoutes({ upgradeWebSocket, caller, live, hub, report })
}
