import { copyFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { binaryLibraries, binaryPlatform } from './binary-platform'
import { hasAddonFile, platformPackages } from './native-package'
import { packageFiles } from './package-dir'
import { packageTree, type NativeImport, type PlacedPackage } from './package-tree'
import { bundleTargets, isPlatformPackage, isTarget, runImageLibraries } from './targets'

// A file of a package, with the platform it is built for and the libraries it links when it is a native binary.
type PackageFile = { file: string; platform?: string; libraries: string[] }

const readFiles = async (dir: string): Promise<PackageFile[]> =>
  Promise.all(
    (await packageFiles(dir)).map(async (file) => {
      const bytes = await readFile(path.join(dir, file))
      return { file, platform: binaryPlatform(bytes), libraries: binaryLibraries(bytes) }
    }),
  )

// The files that go into the bundle: all but the binaries for other platforms.
const shipped = (files: PackageFile[]) => files.filter(({ platform }) => platform === undefined || isTarget(platform))

const label = (pkg: PlacedPackage) => `${pkg.json.name ?? pkg.name} ${pkg.json.version ?? ''}`.trim()

// What keeps a package's add-on from running everywhere a bundle runs, if anything: every target needs a `.node`
// binary, in the package itself or in one of its platform packages. A platform package is its parent's to check.
const addonProblem = async (pkg: PlacedPackage, filesOf: (dir: string) => Promise<PackageFile[]>) => {
  if (isPlatformPackage(pkg.json)) return undefined
  const own = await filesOf(pkg.dir)
  const platforms = await platformPackages(pkg.dir, pkg.json)
  if (!hasAddonFile(own.map(({ file }) => file)) && platforms.length === 0) return undefined
  const files = [own, ...(await Promise.all(platforms.map((dep) => filesOf(dep.dir))))].flat()
  const found = new Set(files.flatMap(({ file, platform }) => (file.endsWith('.node') && platform ? [platform] : [])))
  const missing = bundleTargets.filter((target) => !found.has(target))
  if (missing.length === 0) return undefined
  return `${label(pkg)}: no add-on for ${missing.join(' or ')} (found ${[...found].sort().join(', ') || 'none'})`
}

// The binaries a package ships that link a library neither the run image nor the bundle has, which would not load.
const libraryProblems = (pkg: PlacedPackage, files: PackageFile[], bundled: ReadonlySet<string>) =>
  shipped(files).flatMap(({ file, libraries }) => {
    const missing = libraries.filter((library) => !runImageLibraries.has(library) && !bundled.has(library))
    return missing.length === 0 ? [] : [`${label(pkg)}: ${file} needs ${missing.join(', ')}, which neither the run image nor the bundle has`]
  })

const refusal = (problems: string[]) =>
  [
    `Native add-ons need binaries for ${bundleTargets.join(' and ')} (glibc), linking only what the run image or the bundle has:`,
    ...problems.map((problem) => `  ${problem}`),
    "A package that builds or downloads its add-on on install (node-gyp, prebuild-install) only has the build machine's;",
    'one with per-platform packages needs the linux ones installed (pnpm: supportedArchitectures). See https://docs.protobase.net/reference/cli/#native-packages.',
  ].join('\n')

// Copies the packages the config module loads from disk, and all they need, into `nodeModulesDir`, without the
// binaries for other platforms. Refuses, before writing anything, when an add-on has no binary for some target or a
// binary links a library it would not find.
export const copyPackages = async (imports: NativeImport[], nodeModulesDir: string) => {
  const tree = await packageTree(imports)
  const read = new Map<string, Promise<PackageFile[]>>()
  const filesOf = (dir: string) => {
    if (!read.has(dir)) read.set(dir, readFiles(dir))
    return read.get(dir)!
  }

  const files = await Promise.all(tree.map((pkg) => filesOf(pkg.dir)))
  const bundled = new Set(files.flatMap((list) => shipped(list).map(({ file }) => path.basename(file))))
  const problems = [
    ...(await Promise.all(tree.map((pkg) => addonProblem(pkg, filesOf)))).filter((problem) => problem !== undefined),
    ...tree.flatMap((pkg, i) => libraryProblems(pkg, files[i]!, bundled)),
  ]
  if (problems.length > 0) throw new Error(refusal(problems))

  for (const [i, pkg] of tree.entries()) {
    for (const { file } of shipped(files[i]!)) {
      const target = path.join(nodeModulesDir, pkg.dest, file)
      await mkdir(path.dirname(target), { recursive: true })
      await copyFile(path.join(pkg.dir, file), target)
    }
  }
  return tree
}
