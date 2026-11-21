import semver from 'semver'
import { missingCapabilities, type PluginCapabilities } from './plugin-capabilities'

// Whether `text` is one comparator, `>=`, `>`, `<=`, `<` or `=` and a version: every app reads ranges of those, the
// oldest included, which a caret or x-range written by a newer plugin would not be.
const isComparator = (text: string) => {
  try {
    new semver.Comparator(text)
    return true
  } catch (error) {
    if (error instanceof TypeError) return false
    throw error
  }
}

/**
 * Whether `version` is in `range`: comparators such as `>=0.12.0 <1.0.0`, separated by spaces, all of which must hold.
 * A prerelease, such as a build from main, is in a range of releases too, just before its own release: 0.13.0-main.x is
 * in >=0.12.9 and <0.13.0, not in >=0.13.0. Undefined when the range is not one of those, or the version is no semver version.
 */
export const inRange = (version: string, range: string): boolean | undefined => {
  const comparators = range.trim().split(/\s+/)
  if (semver.valid(version) === null || range.trim() === '' || !comparators.every(isComparator)) return undefined
  return semver.satisfies(version, range, { includePrerelease: true })
}

/**
 * What a plugin's plugin.json says it is built for: a plugin API, what it uses from Protobase, and the Protobase versions
 * it runs on when its author names them (`engines.protobase`).
 */
export type PluginRequirement = PluginCapabilities & { api: number; protobase?: string }

/** An app that loads plugins: the plugin API its @protobase/ui provides, its Protobase version, and what it provides. */
export type PluginHost = PluginCapabilities & { api: number; version: string }

/**
 * Why an app does not load a plugin built for `requirement`, or undefined when it does: the plugin API must be the
 * app's, the app's Protobase version in the plugin's range when it names one, and the app must provide everything the
 * plugin uses.
 */
export const pluginProblem = (requirement: PluginRequirement, host: PluginHost): string | undefined => {
  if (requirement.api !== host.api) return `it is built for plugin API ${requirement.api}, and this app has plugin API ${host.api}`
  if (requirement.protobase !== undefined) {
    const fits = inRange(host.version, requirement.protobase)
    if (fits === undefined) return `its Protobase range "${requirement.protobase}" is not one this app reads, such as >=0.12.0`
    if (!fits) return `it needs Protobase ${requirement.protobase}, and this app runs ${host.version}`
  }
  const missing = missingCapabilities(requirement, host)
  if (missing.length > 0) return `it uses what this app does not have: ${missing.join(', ')}`
  return undefined
}
