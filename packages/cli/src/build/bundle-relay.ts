import { appRelayChannels, configExports } from '@protobase/server'
import type { MergedConfig } from '../config/merge-config'
import { projectResources } from '../config/project-parts'
import { relayAppPart } from '../relay/app-entry'

/**
 * What the manifest says of the app's relay: the app's part of its entry in the relay's apps file, from `realtime.relay`
 * or the channels its conversation pages derive (`appRelayChannels`), and its views, as `protobase relay app` prints
 * it, without the address, id or keys a build does not hold. `undefined` for an app that cannot use the relay, so its
 * presence means the app uses it, or the platform can move it there with its switch.
 */
export const bundleRealtime = async (config: MergedConfig) => {
  const relay = config.realtime?.relay
  const exported = configExports(await projectResources(config))
  const views = exported.views.map((view) => view.toModel())
  const channels = appRelayChannels(relay, { views, models: exported.resources.map((resource) => resource.toModel()), signIn: Boolean(config.auth) })
  if (!channels) return
  return relayAppPart({ ...relay, channels }, { apiPath: config.apiPath, views })
}
