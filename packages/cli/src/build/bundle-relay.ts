import { configExports } from '@protobase/server'
import type { MergedConfig } from '../config/merge-config'
import { projectResources } from '../config/project-parts'
import { relayAppPart } from '../relay/app-entry'

/**
 * What the manifest says of the config's `realtime.relay`: the app's part of its entry in the relay's apps file, from
 * the config and its views, as `protobase relay app` prints it, without the address, id or keys a build does not hold.
 * `undefined` without `realtime.relay`, so its presence means the app hands its connections to the relay.
 */
export const bundleRelay = async (config: MergedConfig) => {
  const relay = config.realtime?.relay
  if (!relay) return
  const views = configExports(await projectResources(config)).views.map((view) => view.toModel())
  return relayAppPart(relay, { apiPath: config.apiPath, views })
}
