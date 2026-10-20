import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The name and version of the package installed as `name` in the workspace `dir`, read from
 * `<dir>/node_modules/<name>/package.json` by path, never by Node's lookup, which would go on into the project's own
 * node_modules. Its `name` is the package's own, which differs from `name` for an npm alias.
 */
export const installedPackage = (dir: string, name: string) => {
  const file = path.join(dir, 'node_modules', name, 'package.json')
  if (!existsSync(file)) throw new Error(`${name} is not installed in ${dir}: run the command again to install it`)
  const { name: own, version, bin } = JSON.parse(readFileSync(file, 'utf8')) as { name: string; version: string; bin?: Record<string, string> }
  return { name: own, version, ...(bin && { bin }) }
}
