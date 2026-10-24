import mobilePackage from '../../../mobile/package.json' with { type: 'json' }
import { installedPackage } from './installed-package'

/**
 * The packages @protobase/mobile pins, itself included, which `mobile.plugins` may neither pin again nor compile into
 * the app. Read from its package.json and inlined into the CLI's build, so the CLI carries the list of the
 * @protobase/mobile of its own version, the one it installs.
 */
export const pinnedPackages = new Set([mobilePackage.name, ...Object.keys(mobilePackage.dependencies)])

/** The native packages @protobase/mobile pins, name → version. */
export const nativeDependencies: Record<string, string> = Object.fromEntries(Object.entries(mobilePackage.dependencies).filter(([name]) => !name.startsWith('@protobase/')))

/**
 * The native code an app's binary carries from @protobase/mobile, name → version, which a native fingerprint names:
 * the native packages it pins, at their versions, and its own native code by its `nativeContract`, `native-<n>`. Never
 * its npm version, which is Protobase's: every Protobase release would cut the binaries off updates. Raise
 * `nativeContract` whenever its Android or iOS sources change; its test fails until it is.
 */
export const pinnedNative: Record<string, string> = {
  ...nativeDependencies,
  [mobilePackage.name]: `native-${mobilePackage.nativeContract}`,
}

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

/**
 * Checks that the native packages installed in the workspace `dir` are the versions @protobase/mobile pins, which the
 * native fingerprint names, whatever npm left in the workspace, so a binary never names native code it does not hold.
 */
export const checkPinnedNative = (dir: string, pinned = nativeDependencies) => {
  for (const [name, version] of Object.entries(pinned)) {
    const installed = installedPackage(dir, name).version
    if (installed !== version) throw new Error(`${name} is ${installed}, not ${version}: delete .protobase/mobile and run the command again`)
  }
}
