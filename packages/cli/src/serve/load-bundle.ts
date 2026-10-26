import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ConfigCommand, ConfigInput } from '@protobase/config'
import { bundleBasePath } from '../bundle/manifest'
import { withDefaults } from '../config/config-defaults'
import { mergeConfig, type MergedConfig } from '../config/merge-config'
import type { ProjectFiles } from '../config/project-files'
import { calledConfig } from '../config/called-config'

type Module = Record<string, unknown>

/** The code of a folder's conventions as a bundle carries it: references to its own modules (see `bundleEntryCode`). */
export type BundleFiles = { resources?: () => Promise<Module>; functions: Record<string, () => Promise<Module>>; modules: Record<string, () => Promise<Module>> }

type BundledConfig = { config: ConfigInput; label: string; files: BundleFiles }

/** What the config module of a bundle from `protobase build` exports. */
export type BundleModule = { own: BundledConfig; extensions: BundledConfig[]; packages: Record<string, () => Promise<Module>> }

/** Checks a bundle's config module: one `protobase build` wrote. */
export const bundleModule = (module: Record<string, unknown>, file: string): BundleModule => {
  if (typeof module.own !== 'object' || module.own === null || !Array.isArray(module.extensions) || typeof module.packages !== 'object') {
    throw new Error(`${file} is not a config module of \`protobase build\`; build the project again`)
  }
  return module as unknown as BundleModule
}

const projectFiles = ({ resources, functions, modules }: BundleFiles, packages: BundleModule['packages']): ProjectFiles => ({
  ...(resources && { resources }),
  functions,
  module: (file) => modules[file],
  package: async (name) => {
    const load = packages[name]
    if (!load) throw new Error(`The bundle carries no ${name}; build it again`)
    return load()
  },
})

/**
 * The config a bundle carries, read again where it serves, with the environment there, merged after the extensions'
 * configs, with the code its conventions found when it was built.
 */
export const bundledConfig = async (bundle: BundleModule, command: ConfigCommand, root: string): Promise<MergedConfig> => {
  const configEnv = { command, env: process.env, root }
  const sources = []
  for (const { config, label, files } of [...bundle.extensions, bundle.own]) sources.push({ config: await calledConfig(config, configEnv, label), files: projectFiles(files, bundle.packages), label })
  const config = withDefaults(mergeConfig(...sources), command, process.env)
  const basePath = config.apiPath
  if (basePath !== undefined && basePath !== bundleBasePath) {
    throw new Error(`apiPath is ${JSON.stringify(basePath)}; a bundle's UI and manifest expect the API at ${bundleBasePath}, so remove it (see https://docs.protobase.net/reference/cli/#the-manifest)`)
  }
  return config
}

/** The config of the bundle's config module `file`, read again for `command` with the environment of this process. */
export const loadBundle = async (file: string, command: ConfigCommand = 'serve'): Promise<MergedConfig> =>
  bundledConfig(bundleModule(await import(pathToFileURL(path.resolve(file)).href), file), command, path.dirname(path.resolve(file)))
