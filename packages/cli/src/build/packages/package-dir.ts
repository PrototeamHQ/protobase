import { existsSync, realpathSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import path from 'node:path'

export type PackageJson = {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  os?: string[]
  cpu?: string[]
  libc?: string[]
}

// The package an import names: `pg` for `pg/lib/client`, `@scope/name` for `@scope/name/sub`. Undefined for a
// relative or absolute path, a built-in (`fs`, `node:fs`, `bun:sqlite`) or a plugin's virtual module.
export const packageName = (id: string) => {
  if (isBuiltin(id) || /^[./\\\0]|^[a-z]+:/i.test(id)) return undefined
  const [first, second] = id.split('/')
  if (!first!.startsWith('@')) return first
  return second ? `${first}/${second}` : undefined
}

// The folder Node's resolution finds a package in from `fromDir`, with symlinks (pnpm's) resolved.
export const findPackageDirSync = (name: string, fromDir: string): string | undefined => {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name)
    if (path.basename(dir) !== 'node_modules' && existsSync(path.join(candidate, 'package.json'))) return realpathSync(candidate)
    if (path.dirname(dir) === dir) return undefined
  }
}

export const findPackageDir = async (name: string, fromDir: string): Promise<string | undefined> => findPackageDirSync(name, fromDir)

export const readPackageJson = async (dir: string): Promise<PackageJson> => JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'))

// Every file of a package, relative to its folder; packages installed inside it (node_modules) are their own.
export const packageFiles = async (dir: string, sub = ''): Promise<string[]> => {
  const entries = await readdir(path.join(dir, sub), { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(sub, entry.name)
      if (entry.name === 'node_modules') return []
      const kind = entry.isSymbolicLink() ? await stat(path.join(dir, file)) : entry
      if (kind.isDirectory()) return packageFiles(dir, file)
      return kind.isFile() ? [file] : []
    }),
  )
  return files.flat()
}
