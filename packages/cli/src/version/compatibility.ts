type Version = { major: number; minor: number; patch: number }

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

const parseVersion = (value: unknown): Version | undefined => {
  const match = typeof value === 'string' ? versionPattern.exec(value) : null
  if (!match) return undefined
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

// The release line a bundle of `version` is built and served on: below 1.0 every minor is a line of its own.
const line = (version: Version) => `${version.major}.${version.minor}.x`

// The bundles a runtime of `version` serves.
const servedRange = (version: Version) => (version.major === 0 ? line(version) : `${version.major}.0.x to ${line(version)}`)

// The runtimes that serve a bundle of `version`.
const neededRuntime = (version: Version) => (version.major === 0 ? line(version) : `${version.major}.${version.minor} or a newer ${version.major}.x`)

/**
 * Why a runtime of Protobase `runtime` cannot serve a bundle built by Protobase `bundle`, or undefined when it can.
 * It can when both have the same major and the runtime's minor is the bundle's or newer; below 1.0, where a minor
 * may break, the minors must be the same. Patches never matter.
 */
export const bundleVersionProblem = (runtime: string, bundle: unknown): string | undefined => {
  const own = parseVersion(runtime)
  if (!own) throw new Error(`The runtime's own Protobase version ${JSON.stringify(runtime)} is no x.y.z version`)
  const rebuild = `rebuild the bundle with Protobase ${line(own)}`
  if (bundle === undefined) return `the bundle names no Protobase version, so it was built before 0.1.0; ${rebuild} to serve it on this runtime (${runtime})`
  const built = parseVersion(bundle)
  if (!built) return `the bundle's Protobase version ${JSON.stringify(bundle)} is no x.y.z version; ${rebuild} to serve it on this runtime (${runtime})`
  const compatible = built.major === own.major && (own.major === 0 ? built.minor === own.minor : built.minor <= own.minor)
  if (compatible) return undefined
  return `the bundle was built by Protobase ${bundle} and this runtime is Protobase ${runtime}, which serves bundles built by ${servedRange(own)}; ${rebuild} or serve it with a runtime of ${neededRuntime(built)}`
}
