import { findPackageDir, packageFiles, readPackageJson, type PackageJson } from './package-dir'
import { isPlatformPackage } from './targets'

export type InstalledPackage = { name: string; dir: string; json: PackageJson }

// A compiled add-on, or the binding.gyp that compiles one on install.
export const hasAddonFile = (files: readonly string[]) => files.some((file) => file.endsWith('.node') || file === 'binding.gyp')

// The installed optional dependencies that carry a package's add-on per platform (`@node-rs/argon2-darwin-arm64`,
// sharp's `@img/sharp-linux-x64`), when it names a linux one among them. An optional extra for one other platform,
// as fsevents is for chokidar, is not: the package runs on linux without it.
export const platformPackages = async (dir: string, json: PackageJson): Promise<InstalledPackage[]> => {
  const names = Object.keys(json.optionalDependencies ?? {})
  if (!names.some((name) => name.includes('linux'))) return []
  const installed = await Promise.all(
    names.map(async (name): Promise<InstalledPackage[]> => {
      const found = await findPackageDir(name, dir)
      return found ? [{ name, dir: found, json: await readPackageJson(found) }] : []
    }),
  )
  return installed.flat().filter((dep) => isPlatformPackage(dep.json))
}

// A package with a native add-on: it loads the add-on from its own files at runtime, so it cannot be inlined.
export const isNativePackage = async (dir: string) => {
  if (hasAddonFile(await packageFiles(dir))) return true
  return (await platformPackages(dir, await readPackageJson(dir))).length > 0
}
