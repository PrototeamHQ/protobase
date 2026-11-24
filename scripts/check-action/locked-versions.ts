// The registry versions a bun.lock records, as `overrides` for an app outside the workspace, so the app installs the
// third-party packages this checkout was locked and tested with instead of whatever the registry publishes today.
type Lock = { packages: Record<string, [string, ...unknown[]]> }

// A lock key is a package's name, or a path such as `parent/child` for a copy nested under its dependent.
const nameOf = (key: string) => {
  const parts = key.split('/')
  const scope = parts.at(-2)
  return scope?.startsWith('@') ? `${scope}/${parts.at(-1)}` : parts.at(-1)!
}

const isNested = (key: string) => nameOf(key) !== key

/**
 * One override per package the lock resolves to exactly one registry version. A package locked at several versions
 * (nested copies) is left to its dependents' ranges, since one override would force them all onto a single version.
 */
export const lockedVersions = (lock: Lock) => {
  const nested = new Set(Object.keys(lock.packages).filter(isNested).map(nameOf))
  const versions: Record<string, string> = {}
  for (const [key, [resolved]] of Object.entries(lock.packages)) {
    if (isNested(key) || nested.has(key)) continue
    const version = resolved.slice(key.length + 1)
    if (!resolved.startsWith(`${key}@`) || !/^\d/.test(version)) continue
    versions[key] = version
  }
  return versions
}
