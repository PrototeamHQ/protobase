import type { Db } from '@protobase/query'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { appRelayChannels, checkRelaySchema, readRelaySwitch, type AdminAuth, type RealtimeOptions } from '@protobase/server'

type RelayProject = { realtime?: RealtimeOptions; auth?: AdminAuth; models: readonly ResourceModel[]; views: readonly ViewModel[] }

/**
 * Refuses to start while the relay is on, by the config's `realtime.relay` or the platform's switch, and the app's
 * database lacks what its channels need of it. A switch with no channels to derive is left to the server, which
 * stops naming it.
 */
export const checkProjectRelay = async (db: Db, { realtime, auth, models, views }: RelayProject, env: Record<string, string | undefined>) => {
  if (!realtime?.relay && !readRelaySwitch(env)) return
  const channels = appRelayChannels(realtime?.relay, { views, models, signIn: Boolean(auth) })
  if (!channels) return
  await checkRelaySchema(db, auth, channels, models)
}
