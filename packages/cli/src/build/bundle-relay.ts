import { appRelayChannels, configExports } from '@protobase/server'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { MergedConfig } from '../config/merge-config'
import { projectResources } from '../config/project-parts'
import { relayAppPart } from '../relay/app-entry'

/** The config folder's views and resources, as the build's view check loads them (`checkViews`). */
export type ConfigFolder = { views: readonly ViewModel[]; models: readonly ResourceModel[] }

/**
 * What the manifest says of the app's relay: the app's part of its entry in the relay's apps file, from `realtime.relay`
 * and the app's views, or else from the channels the config folder's conversation pages derive (`appRelayChannels`),
 * as `protobase relay app` prints it, without the address, id or keys a build does not hold. `undefined` for an app
 * that cannot use the relay, so its presence means the app uses it, or the platform can move it there with its switch.
 * Only `realtime.relay` loads the app's resources again; deriving reads the folder the view check loaded.
 */
export const bundleRealtime = async (config: MergedConfig, folder: ConfigFolder) => {
  const relay = config.realtime?.relay
  if (relay) {
    const exported = configExports(await projectResources(config))
    const app = { views: exported.views.map((view) => view.toModel()), models: exported.resources.map((resource) => resource.toModel()), signIn: true }
    return relayAppPart({ ...relay, channels: appRelayChannels(relay, app)! }, { apiPath: config.apiPath, views: app.views })
  }
  const channels = appRelayChannels(undefined, { ...folder, signIn: Boolean(config.auth) })
  if (!channels) return
  return relayAppPart({ channels }, { apiPath: config.apiPath, views: folder.views })
}
