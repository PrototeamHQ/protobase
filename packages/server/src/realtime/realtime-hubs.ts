import type { Deps } from '../deps'
import { broadcastHub } from './broadcast-hub'
import { presenceHub } from './presence-hub'
import { relayed, type RealtimeOptions } from './relay/realtime-options'
import { relayedHubs } from './relay/relayed-hubs'

/**
 * The broadcast and presence hubs of a process: those of the topic channels of `/api/sb/realtime/v1`, and apart from
 * them those of the record channels of `/api/channels`, so neither hears the other. With `processes: 'many'` both go
 * through the one relay, which `follow` reads while a socket of either is open.
 */
export const realtimeHubs = (deps: Pick<Deps, 'db' | 'statementTimeoutMs'>, options: RealtimeOptions | undefined, report: (error: unknown) => void) => {
  if (relayed(options)) return relayedHubs({ db: deps.db, statementTimeoutMs: deps.statementTimeoutMs, report })
  return { topics: { broadcasts: broadcastHub(), presences: presenceHub() }, records: { broadcasts: broadcastHub(), presences: presenceHub() }, follow: () => () => {} }
}

export type RealtimeHubs = ReturnType<typeof realtimeHubs>
