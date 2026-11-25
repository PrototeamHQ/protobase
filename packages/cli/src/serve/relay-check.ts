import type { ResourceModel, ViewModel } from '@protobase/schema'
import { appRelayChannels, readRelaySwitch, type AdminAuth, type RealtimeOptions } from '@protobase/server'

type RelayProject = { realtime?: RealtimeOptions; auth?: AdminAuth; models: readonly ResourceModel[]; views: readonly ViewModel[] }

/**
 * Refuses to start while the platform's switch is neither true nor false, or the relay is on, by the config's
 * `realtime.relay` or the switch, and its channels do not fit the views. What the channels need of the database is
 * the relay module, which the record of migrations holds. A switch with no channels to derive is left to the server,
 * which stops naming it.
 */
export const checkProjectRelay = ({ realtime, auth, models, views }: RelayProject, env: Record<string, string | undefined>) => {
  if (!realtime?.relay && !readRelaySwitch(env)) return
  appRelayChannels(realtime?.relay, { views, models, signIn: Boolean(auth) })
}
