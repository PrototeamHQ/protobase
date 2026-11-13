import { loadSourceConfig } from '../config/source-config'
import type { ImportModules } from '../config/read-config'
import type { Extension } from '../project/extensions'
import { sharedDb } from './create-db'
import { devModuleUrl } from './dev-module-url'
import { serverPackage } from './server-package'

const load = (file: string): Promise<Record<string, unknown>> => import(/* @vite-ignore */ devModuleUrl(file))

const importModules: ImportModules = async (files) => {
  const modules = []
  for (const file of files) modules.push(await load(file))
  return modules
}

/**
 * The project's config as `protobase dev` reads it on every load: protobase.config.ts, with the convention's resources
 * and functions when it names none, merged after the extensions' configs, as `protobase build` merges them. What its
 * references name loads through Vite's module graph, so an edit to it reloads the API.
 */
export const loadDevConfig = (projectDir: string, extensions: Extension[] = []) => loadSourceConfig(projectDir, { command: 'dev', extensions, importModules })

/** The app's database, over the `pg` the project's config gets, shared across reloads. */
export const devDatabase = (projectDir: string) => {
  const url = process.env.PROTOBASE_DATABASE_URL
  if (!url) throw new Error('No database: set DATABASE_URL (or pass --env)')
  return sharedDb(serverPackage(projectDir).root, url)
}
