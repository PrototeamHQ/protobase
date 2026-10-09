import { realpath } from 'node:fs/promises'
import { findPackageDir, readPackageJson, type PackageJson } from './package-dir'
import { isPlatformPackage, packageTargets } from './targets'

// A package the config module imports and loads from disk, by the name it imports and its installed folder.
export type NativeImport = { name: string; dir: string }

// A package in the bundle's node_modules: `dest` is its folder there, `a`, or `a/node_modules/b` when another
// version of `b` already sits at the top.
export type PlacedPackage = { name: string; dir: string; dest: string; json: PackageJson }

// The folders Node looks in for `name` from a package at `dest`, nearest first.
const lookupPath = (dest: string, name: string) => {
  const parts = dest.split('/node_modules/')
  return [...parts.map((_, i) => [...parts.slice(0, parts.length - i), name].join('/node_modules/')), name]
}

// Platform packages for no target are left out, as a package manager on the target leaves them out.
const runsOnTarget = (json: PackageJson) => !isPlatformPackage(json) || packageTargets(json).length > 0

// The imported packages and every package they need at runtime (dependencies, and optional ones that are installed),
// laid out as one node_modules folder: each at the top, unless another version is there already, then under the
// package that needs it. Node's resolution then finds from every package what it found where they are installed.
export const packageTree = async (imports: NativeImport[]): Promise<PlacedPackage[]> => {
  const placed = new Map<string, string>()
  const tree: PlacedPackage[] = []
  const place = (pkg: PlacedPackage) => {
    placed.set(pkg.dest, pkg.dir)
    tree.push(pkg)
  }

  for (const imported of imports) {
    const { name } = imported
    const dir = await realpath(imported.dir)
    const there = placed.get(name)
    if (there !== undefined && there !== dir) throw new Error(`The config imports two installs of ${name}: ${there} and ${dir}`)
    const json = await readPackageJson(dir)
    if (there === undefined && runsOnTarget(json)) place({ name, dir, dest: name, json })
  }

  // The tree grows while it is walked, so every placed package gets its own dependencies placed.
  for (let i = 0; i < tree.length; i++) {
    const parent = tree[i]!
    const optional = parent.json.optionalDependencies ?? {}
    for (const name of new Set([...Object.keys(parent.json.dependencies ?? {}), ...Object.keys(optional)])) {
      const dir = await findPackageDir(name, parent.dir)
      if (!dir && name in optional) continue
      if (!dir) throw new Error(`${name}, which ${parent.name} needs, is not installed`)
      const json = await readPackageJson(dir)
      if (!runsOnTarget(json)) continue
      const candidates = lookupPath(parent.dest, name)
      const found = candidates.find((dest) => placed.has(dest))
      if (found !== undefined && placed.get(found) === dir) continue
      place({ name, dir, dest: found === undefined ? name : candidates[0]!, json })
    }
  }
  return tree
}
