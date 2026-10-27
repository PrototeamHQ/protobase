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
const pin = (name: string, spec: string, range: string) => {
  if (!spec.startsWith('workspace:')) return spec
  if (spec !== 'workspace:*') throw new Error(`${name}: only workspace:* can be pinned to the release version, not ${spec}`)
  return range
}

const isProtobase = (name: string) => name.startsWith('@protobase/')

/**
 * A preset's package.json: the example's, with its workspace dependencies pinned to `range` and its @protobase packages
 * in devDependencies, so an app made from it is bundled: dev, build and its scripts run the CLI's own copies, and a
 * newer CLI within the range updates it with no change to its files (see the Versioning page). The examples in this
 * repository list them in dependencies, locked to the workspace's packages.
 */
export const presetPackage = (source: PackageJson, range: string): PackageJson => {
  const { dependencies = {}, devDependencies = {}, ...rest } = source
  const pinned = (listed: Dependencies) => Object.entries(listed).map(([name, spec]): [string, string] => [name, pin(name, spec, range)])
  const runtime = pinned(dependencies).filter(([name]) => !isProtobase(name))
  const dev = [...pinned(dependencies).filter(([name]) => isProtobase(name)), ...pinned(devDependencies)].sort(([a], [b]) => a.localeCompare(b))
  return {
    ...rest,
    ...(runtime.length > 0 && { dependencies: Object.fromEntries(runtime) }),
    ...(dev.length > 0 && { devDependencies: Object.fromEntries(dev) }),
  }
}

/** What `protobase types` writes, which a preset's tsconfig.json extends. */
export const typesTsconfig = './.protobase/tsconfig.json'

/**
 * A preset's tsconfig.json: the example's, extending the types `protobase types` writes, so an app made from it types
 * the @protobase packages from the CLI that builds it. The examples in this repository do not extend it: Vite reads
 * an example's tsconfig.json when it transforms its files, and fails while the file it extends is not written yet.
 */
export const presetTsconfig = (source: Record<string, unknown>) => ({ extends: typesTsconfig, ...source })
