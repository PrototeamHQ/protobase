import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import semver from 'semver'
import { isLocalSpec, localFolder } from './local-spec'
import { packageNameProblem } from './package-name'

/** A dependency a local folder in the workspace declares, and the version the workspace's root holds of it. */
export type LocalPin = { key: string; name: string; spec: string; optional: boolean; installed: string | undefined }

type Manifest = {
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

// The JSON in `file`, or undefined when it is missing or not JSON.
const readJson = (file: string): unknown => {
  if (!existsSync(file)) return undefined
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

// The version of `name` at the root of the workspace `dir`, where Capacitor reads it, read by path.
const rootVersion = (dir: string, name: string) => {
  const manifest = readJson(path.join(dir, 'node_modules', name, 'package.json')) as { version?: unknown } | undefined
  return typeof manifest?.version === 'string' ? manifest.version : undefined
}

/**
 * The dependencies of each local folder among the workspace `dir`'s `dependencies`, which npm hoists to the workspace's
 * root: optional and peer ones too, as npm installs them. A folder without a readable package.json, or a dependency
 * that is no package name, is refused before anything is removed.
 */
export const localPins = (dir: string, dependencies: Record<string, string>): LocalPin[] =>
  Object.entries(dependencies)
    .filter(([, spec]) => isLocalSpec(spec))
    .flatMap(([key, spec]) => {
      const file = path.join(localFolder(dir, spec), 'package.json')
      const manifest = readJson(file) as Manifest | undefined
      if (typeof manifest !== 'object' || manifest === null) throw new Error(`${key} is installed from a local folder whose package.json is missing or not JSON: ${file}`)
      const optionalPeer = (name: string) => manifest.peerDependenciesMeta?.[name]?.optional === true
      const groups: Array<[Record<string, string> | undefined, (name: string) => boolean]> = [
        [manifest.dependencies, () => false],
        [manifest.optionalDependencies, () => true],
        [manifest.peerDependencies, optionalPeer],
      ]
      return groups.flatMap(([group, optional]) =>
        Object.entries(group ?? {}).map(([name, pin]) => {
          const problem = packageNameProblem(name, file)
          if (problem) throw new Error(problem)
          return { key, name, spec: String(pin), optional: optional(name), installed: rootVersion(dir, name) }
        }),
      )
    })

/** Whether npm installs a version for the pin that the workspace can be checked against: a version or a range. */
export const isCheckable = ({ spec }: LocalPin) => semver.validRange(spec) !== null

/**
 * Whether the workspace's root does not hold what the pin asks: a pin that is no version or range, such as a tag, git,
 * a URL, an alias or another folder, never counts as held. An optional one that is absent is held.
 */
export const isUnmet = (pin: LocalPin) => {
  if (pin.installed === undefined) return !pin.optional
  return !isCheckable(pin) || !semver.satisfies(pin.installed, pin.spec)
}

/** Refuses a version or range pin the workspace's root still does not hold after npm installed it, naming every pin of it. */
export const checkLocalPins = (pins: LocalPin[]) => {
  const unmet = pins.find((pin) => isCheckable(pin) && isUnmet(pin))
  if (!unmet) return
  const same = pins.filter(({ name }) => name === unmet.name).map(({ key, spec }) => `${spec} by ${key}`)
  throw new Error(`${unmet.name} is pinned at ${same.join(' and ')}, but .protobase/mobile holds ${unmet.installed ?? 'none'} at its root, where Capacitor reads it: make the pins agree`)
}
