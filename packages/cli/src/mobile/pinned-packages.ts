import mobilePackage from '../../../mobile/package.json' with { type: 'json' }
import { installedPackage } from './installed-package'

/**
 * The packages @protobase/mobile pins, itself included, which `mobile.plugins` may neither pin again nor compile into
 * the app. Read from its package.json and inlined into the CLI's build, so the CLI carries the list of the
 * @protobase/mobile of its own version, the one it installs.
 */
export const pinnedPackages = new Set([mobilePackage.name, ...Object.keys(mobilePackage.dependencies)])

const liveUpdate = '@capawesome/capacitor-live-update'

/** Why the plugin `key`, a package that is or names `name`, may not be listed; `undefined` when it may. */
export const pinnedProblem = (key: string, name = key) => {
  if (name === liveUpdate) return `mobile.plugins lists ${key}, ${liveUpdate}: live updates come with Protobase's updater, which does not enable the plugin yet; remove it from mobile.plugins`
  if (pinnedPackages.has(name)) return `mobile.plugins lists ${key}, which ${name === key ? 'comes' : `installs ${name}, which comes`} with Protobase at a fixed version: remove it from mobile.plugins`
  return undefined
}

/**
 * Checks the installed packages of the configured plugins `keys` in the workspace `dir`: one that is a pinned package
 * under another name, such as an npm alias or a `file:` spec, is refused before Capacitor compiles it in.
 */
export const checkInstalledPlugins = (dir: string, keys: string[]) => {
  for (const key of keys) {
    const problem = pinnedProblem(key, installedPackage(dir, key).name)
    if (problem) throw new Error(problem)
  }
}
