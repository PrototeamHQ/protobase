import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { findPackageDirSync, packageName } from '../build/packages/package-dir'

type Target = string | Target[] | { [condition: string]: Target } | null

// The conditions Node's `import` resolves with, so a package that exports only `import` resolves too.
const conditions = ['node', 'import', 'default']

const targetOf = (target: Target | undefined): string | undefined => {
  if (target === undefined || target === null) return undefined
  if (typeof target === 'string') return target
  if (Array.isArray(target)) return target.map(targetOf).find((found) => found !== undefined)
  const condition = Object.keys(target).find((key) => conditions.includes(key))
  return condition === undefined ? undefined : targetOf(target[condition])
}

// The target `exports` gives a subpath (`.` or `./sub`); a map of conditions alone is the `.` entry's.
const exportOf = (exported: Target, subpath: string) => {
  if (typeof exported === 'string' || Array.isArray(exported) || exported === null) return subpath === '.' ? targetOf(exported) : undefined
  const bySubpath = Object.keys(exported).every((key) => key.startsWith('.'))
  if (!bySubpath) return subpath === '.' ? targetOf(exported) : undefined
  return targetOf(exported[subpath])
}

// A package without `exports`: its `main`, with the extension and index Node's legacy lookup adds.
const mainOf = (dir: string, main = 'index.js') => {
  const found = [main, `${main}.js`, path.join(main, 'index.js')].map((file) => path.join(dir, file)).find((file) => existsSync(file))
  if (!found) throw new Error(`The package in ${dir} has no ${main}`)
  return found
}

/**
 * The file an `import` of `id`, such as `sharp` or `@acme/plugin/steps`, loads from `fromDir`, as Node's ES module
 * resolution finds it: through the package's `exports` with the `import` conditions, otherwise its `main` or
 * `index.js`.
 */
export const packageEntry = (id: string, fromDir: string) => {
  const name = packageName(id)
  if (!name) throw new Error(`${id} is no package name`)
  const dir = findPackageDirSync(name, fromDir)
  if (!dir) throw new Error(`Cannot find the package ${name} from ${fromDir}; install it`)
  const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as { exports?: Target; main?: string }
  const subpath = `.${id.slice(name.length)}`
  if (manifest.exports === undefined) return subpath === '.' ? mainOf(dir, manifest.main) : path.join(dir, subpath)
  const target = exportOf(manifest.exports, subpath)
  if (!target) throw new Error(`The package ${name} exports no ${subpath} to import`)
  return path.join(dir, target)
}
