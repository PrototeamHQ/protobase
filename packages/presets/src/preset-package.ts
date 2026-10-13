type Dependencies = Record<string, string>
type PackageJson = { dependencies?: Dependencies; devDependencies?: Dependencies; [key: string]: unknown }

/**
 * The range an app keeps the @protobase packages in: any version of `version`'s major, from `version` on. Below 1.0
 * ^0.y.z covers only that minor, so there it is spelled `>=0.y.z <1`.
 */
export const majorRange = (version: string) => {
  const major = /^(\d+)\.\d+\.\d+/.exec(version)?.[1]
  if (major === undefined) throw new Error(`not a version: ${version}`)
  return major === '0' ? `>=${version} <1` : `^${version}`
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
