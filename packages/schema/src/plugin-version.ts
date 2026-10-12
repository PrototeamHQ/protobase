type Version = readonly [number, number, number]

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

const parseVersion = (text: string): Version | undefined => {
  const match = versionPattern.exec(text)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined
}

const compare = (a: Version, b: Version) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

const comparatorPattern = /^(>=|<=|>|<|=)?(.+)$/

const holds = {
  '>=': (order: number) => order >= 0,
  '<=': (order: number) => order <= 0,
  '>': (order: number) => order > 0,
  '<': (order: number) => order < 0,
  '=': (order: number) => order === 0,
} as const

/**
 * Whether `version` is in `range`: comparators such as `>=0.12.0 <1.0.0`, separated by spaces, all of which must hold.
 * Undefined when the range is not one of those, or the version is no x.y.z version.
 */
export const inRange = (version: string, range: string): boolean | undefined => {
  const own = parseVersion(version)
  const comparators = range.trim().split(/\s+/)
  if (!own || range.trim() === '') return undefined
  let result = true
  for (const comparator of comparators) {
    const [, operator = '=', text = ''] = comparatorPattern.exec(comparator) ?? []
    const bound = parseVersion(text)
    if (!bound) return undefined
    result &&= holds[operator as keyof typeof holds](compare(own, bound))
  }
  return result
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
