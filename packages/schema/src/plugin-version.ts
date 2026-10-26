import semver from 'semver'

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
 * Undefined when the range is not one of those, or the version is no semver version.
 */
export const inRange = (version: string, range: string): boolean | undefined => {
  const comparators = range.trim().split(/\s+/)
  if (semver.valid(version) === null || range.trim() === '' || !comparators.every(isComparator)) return undefined
  return semver.satisfies(version, range)
}

/** What a plugin's plugin.json says it is built for: a plugin API, and the Protobase versions it runs on. */
export type PluginRequirement = { api: number; protobase: string }

/** An app that loads plugins: the plugin API its @protobase/ui provides, and its Protobase version. */
export type PluginHost = { api: number; version: string }

/**
 * Why an app does not load a plugin built for `requirement`, or undefined when it does: the plugin API must be the
 * app's, and the app's Protobase version in the plugin's range.
 */
export const pluginProblem = (requirement: PluginRequirement, host: PluginHost): string | undefined => {
  if (requirement.api !== host.api) return `it is built for plugin API ${requirement.api}, and this app has plugin API ${host.api}`
  const fits = inRange(host.version, requirement.protobase)
  if (fits === undefined) return `its Protobase range "${requirement.protobase}" is not one this app reads, such as >=0.12.0`
  if (!fits) return `it needs Protobase ${requirement.protobase}, and this app runs ${host.version}`
  return undefined
}
