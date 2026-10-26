import path from 'node:path'
import type { ConfigCommand, ProtobaseConfig } from '@protobase/config'
import type { Extension } from '../project/extensions'
import { importProjectFiles } from '../project/import-project-file'
import { withDefaults } from './config-defaults'
import { mergeConfig } from './merge-config'
import { sourceFiles } from './project-files'
import { configFileOf, readConfigFile, type ImportModules } from './read-config'

export type SourceConfigOptions = {
  command: ConfigCommand
  /** Extensions merged in before the project (`--extend`). */
  extensions?: Extension[]
  /** How the project's files load; default Bun itself, or Vite's module runner on Node. */
  importModules?: ImportModules
}

/**
 * The config of the project in `dir`: protobase.config.ts or protobase.config.json (or none), merged after the
 * extensions' configs, with the code each folder's conventions find. Only the config files run here; that code loads
 * when a command asks for it.
 */
export const loadSourceConfig = async (dir: string, { command, extensions = [], importModules = importProjectFiles }: SourceConfigOptions) => {
  const configEnv = { command, env: process.env, root: dir }
  const extended = []
  for (const extension of extensions) {
    if (!extension.config) continue
    extended.push({ config: await readConfigFile(extension.config, configEnv, importModules), files: sourceFiles(extension.dir, importModules), label: path.basename(extension.dir) })
  }
  const file = configFileOf(dir)
  const own: ProtobaseConfig = file ? await readConfigFile(file, configEnv, importModules) : {}
  return withDefaults(mergeConfig(...extended, { config: own, files: sourceFiles(dir, importModules), label: file ? path.basename(file) : 'config/index.ts' }), command, process.env)
}
