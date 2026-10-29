import type { BundleMobile } from '../bundle/manifest'
import { checkMobileConfig } from '../mobile/mobile-config'

/**
 * What the manifest says of the config's `mobile` section, checked as `protobase mobile` checks it: its app id, which a
 * host that never runs the config binds in the release's statement, and its plugins, empty when it gives none, which it
 * fingerprints the mobile release with. `undefined`
 * without a section, so its presence means the app has a mobile build.
 */
export const bundleMobile = (section: unknown): BundleMobile | undefined => {
  if (section === undefined) return
  const { appId, plugins } = checkMobileConfig(section)
  return { appId, plugins: plugins ?? {} }
}
