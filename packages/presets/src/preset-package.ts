type Dependencies = Record<string, string>
type PackageJson = { dependencies?: Dependencies; devDependencies?: Dependencies; [key: string]: unknown }

// workspace:* is the only range the examples use; publishing pins it to the exact version, and so does a preset.
const pin = (dependencies: Dependencies, version: string) =>
  Object.fromEntries(
    Object.entries(dependencies).map(([name, range]) => {
      if (!range.startsWith('workspace:')) return [name, range]
      if (range !== 'workspace:*') throw new Error(`${name}: only workspace:* can be pinned to the release version, not ${range}`)
      return [name, version]
    }),
  )

/** A preset's package.json: the example's, with its workspace dependencies pinned to the release's version. */
export const presetPackage = (source: PackageJson, version: string): PackageJson => {
  const pinned = { ...source }
  if (source.dependencies) pinned.dependencies = pin(source.dependencies, version)
  if (source.devDependencies) pinned.devDependencies = pin(source.devDependencies, version)
  return pinned
}
