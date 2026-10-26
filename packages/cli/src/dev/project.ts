import { pathToFileURL } from 'node:url'
import { loadSourceConfig } from '../config/source-config'
import type { ImportModules } from '../config/read-config'
import type { Extension } from '../project/extensions'
import { sharedDb } from './create-db'

// Vite serves absolute files under /@fs, which keeps them in the module graph (and so hot reloadable); a package's own
// file loads as it is.
const load = (file: string): Promise<Record<string, unknown>> =>
  file.split('/').includes('node_modules') ? import(/* @vite-ignore */ pathToFileURL(file).href) : import(/* @vite-ignore */ `/@fs${file}`)

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

/** The app's database, shared across reloads. */
export const devDatabase = (projectDir: string) => {
  const url = process.env.PROTOBASE_DATABASE_URL
  if (!url) throw new Error('No database: set DATABASE_URL (or pass --env)')
  return sharedDb(projectDir, url)
}
