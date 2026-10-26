import semver from 'semver'

type Dependencies = Record<string, string>
type PackageJson = { dependencies?: Dependencies; devDependencies?: Dependencies; [key: string]: unknown }

/**
 * The range an app keeps the @protobase packages in: the caret range of `version`, the versions semver calls compatible
 * with it. From 1.0 on that is its major; below 1.0, where a minor may break, its minor.
 */
export const caretRange = (version: string) => {
  if (semver.valid(version) !== version) throw new Error(`not a version: ${version}`)
  return `^${version}`
}

// workspace:* is the only range the examples use; publishing pins it to the exact version, and a preset to `range`.
const pin = (dependencies: Dependencies, range: string) =>
  Object.fromEntries(
    Object.entries(dependencies).map(([name, spec]) => {
      if (!spec.startsWith('workspace:')) return [name, spec]
      if (spec !== 'workspace:*') throw new Error(`${name}: only workspace:* can be pinned to the release version, not ${spec}`)
      return [name, range]
    }),
  )

/** A preset's package.json: the example's, with its workspace dependencies pinned to `range`. */
export const presetPackage = (source: PackageJson, range: string): PackageJson => {
  const pinned = { ...source }
  if (source.dependencies) pinned.dependencies = pin(source.dependencies, range)
  if (source.devDependencies) pinned.devDependencies = pin(source.devDependencies, range)
  return pinned
}
