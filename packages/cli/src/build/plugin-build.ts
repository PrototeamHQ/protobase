import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { inRange } from '@protobase/schema/internal'
import { build, type Plugin, type Rolldown } from 'vite'
import { uiPackageDir } from '../project/admin-app'
import { extensionImports } from '../project/extensions'
import { sharedModules } from '../project/shared-modules'
import { findPackageDirSync, readPackageJson, type PackageJson } from './packages/package-dir'
import { pluginFieldTypes } from './plugin-fields'
import { layerPluginUtilities } from './plugin-styles'

/** The module a plugin's components and action handlers are exported from, as a project's are. */
export const pluginEntryFile = 'protobase.ui.tsx'

/** What `build-plugin` writes beside the plugin's files, which the app reads first. */
export const pluginManifestFile = 'plugin.json'

/**
 * A plugin.json: the plugin's name and own version, the plugin API and Protobase versions it is built for, its module
 * and stylesheet relative to it, and the field types it registers with the storage types each shows.
 */
export type PluginManifest = { name: string; version?: string; api: number; protobase: string; entry: string; css: string; fields?: Record<string, string[]> }

type UiPackageJson = PackageJson & { protobase?: { pluginApi?: number }; exports?: Record<string, unknown>; engines?: Record<string, string> }

// Tailwind's stylesheets, from the copy the admin app is built with.
const tailwindDir = path.dirname(createRequire(path.join(uiPackageDir, 'package.json')).resolve('tailwindcss/package.json'))

/**
 * What the plugin is built for, from the @protobase/ui installed for it (else for the project it extends): its plugin
 * API, and Protobase from its version on, unless the plugin's package.json names other versions in `engines.protobase`.
 * Also that version's theme, which the plugin's stylesheet draws with, and its folder.
 */
const pluginTarget = async (pluginDir: string, own: UiPackageJson, projectDir: string | undefined) => {
  const uiDir = findPackageDirSync('@protobase/ui', pluginDir) ?? (projectDir === undefined ? undefined : findPackageDirSync('@protobase/ui', projectDir))
  if (!uiDir) throw new Error(`@protobase/ui is not installed for ${pluginDir}; add it to the plugin's dependencies, as the version it is built for`)
  const ui = (await readPackageJson(uiDir)) as UiPackageJson
  const api = ui.protobase?.pluginApi
  const theme = ui.exports?.['./theme.css']
  if (api === undefined || typeof theme !== 'string') throw new Error(`@protobase/ui ${ui.version} loads no plugins; install a version that does`)
  const protobase = own.engines?.protobase ?? `>=${ui.version}`
  const fits = inRange(ui.version ?? '', protobase)
  if (fits === undefined) throw new Error(`engines.protobase "${protobase}" is not a range the app reads; write comparators such as >=0.12.0 <1.0.0`)
  if (!fits) throw new Error(`engines.protobase "${protobase}" leaves out @protobase/ui ${ui.version}, which the plugin is built with`)
  return { api, protobase, theme: path.join(uiDir, theme), uiDir }
}

// A plugin imports the shared modules by name and the app supplies them; anything else of theirs would be a second copy.
const pluginImports = (): Plugin => ({
  name: 'protobase-plugin-imports',
  enforce: 'pre',
  resolveId(id) {
    if ((sharedModules as readonly string[]).includes(id)) return { id, external: true }
    if (sharedModules.some((name) => id.startsWith(`${name}/`))) {
      this.error(`${id} is not shared with plugins, and a copy of its own would not work with the app's; a plugin imports ${sharedModules.join(', ')} by those names alone`)
    }
    return undefined
  },
})

const inside = (dir: string, parent: string) => {
  const relative = path.relative(parent, dir)
  return !relative.startsWith('..') && !path.isAbsolute(relative)
}

// The plugin's stylesheet: Tailwind's utilities for the classes in the plugin's files and nothing else, no reset and no
// theme values, each token read from the app's theme with Tailwind's default as the fallback. Folders the build writes
// to inside the plugin's are not its files.
const styleCode = (pluginDir: string, theme: string, outDirs: string[]) =>
  [
    '@layer theme, base, components, utilities;',
    `@import ${JSON.stringify(path.join(tailwindDir, 'theme.css'))} layer(theme) theme(reference);`,
    `@reference ${JSON.stringify(theme)};`,
    `@import ${JSON.stringify(path.join(tailwindDir, 'utilities.css'))} layer(utilities) source(none);`,
    `@source ${JSON.stringify(pluginDir)};`,
    ...outDirs.filter((dir) => inside(dir, pluginDir)).map((dir) => `@source not ${JSON.stringify(dir)};`),
    '',
  ].join('\n')

// A stylesheet standing in for a file in the plugin's folder, so Tailwind reads it as one of the plugin's.
const pluginStyles = (file: string, code: string): Plugin => ({
  name: 'protobase-plugin-styles',
  resolveId: (id) => (id === file ? id : undefined),
  load: (id) => (id === file ? code : undefined),
})

// The written stylesheet with the plugin's utilities layered under the app's (see layerPluginUtilities).
const layeredStyles = (): Plugin => ({
  name: 'protobase-plugin-layered-styles',
  enforce: 'post',
  generateBundle(_, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type === 'asset' && file.fileName.endsWith('.css')) file.source = layerPluginUtilities(String(file.source))
    }
  },
})

const outputOf = (result: Awaited<ReturnType<typeof build>>): Rolldown.RolldownOutput => {
  if (Array.isArray(result)) return result[0]!
  if ('output' in result) return result
  throw new Error('The plugin build did not finish')
}

/** The output folder must not hold the plugin's own files, which emptying it would delete. */
const checkOutDir = (pluginDir: string, outDir: string) => {
  if (inside(pluginDir, outDir)) throw new Error(`--out ${outDir} holds the plugin's own files; build into a folder inside it or elsewhere, such as ${path.join(pluginDir, 'dist')}`)
}

export type PluginBuildInput = {
  pluginDir: string
  outDir: string
  name?: string
  /**
   * The project a plugin of `protobase build` belongs to, its own UI or an `--extend` folder's: the plugin's imports of
   * @protobase packages resolve from it, as they do in `protobase dev`, and so does @protobase/ui when the plugin has none.
   */
  projectDir?: string
  /** Folders inside the plugin's that are no files of it, such as the bundle being written. */
  ignore?: string[]
  /** Ends each script with a `//# debugId=` comment, naming no map, and writes its source map, with the same debug id, beside it. */
  sourceMaps?: boolean
}

/**
 * Builds the plugin in `pluginDir` into `outDir`: its protobase.ui.tsx as an ES module (and its chunks) that imports the
 * shared modules by name, its stylesheet, and plugin.json naming both and the field types it registers. The app loads
 * it from the plugin.json's URL.
 */
export const buildPlugin = async ({ pluginDir, outDir, name, projectDir, ignore = [], sourceMaps = false }: PluginBuildInput): Promise<PluginManifest> => {
  const entry = path.join(pluginDir, pluginEntryFile)
  if (!existsSync(entry)) throw new Error(`There is no ${pluginEntryFile} in ${pluginDir}; a plugin exports its components and action handlers from it`)
  checkOutDir(pluginDir, outDir)
  const own: UiPackageJson = existsSync(path.join(pluginDir, 'package.json')) ? await readPackageJson(pluginDir) : {}
  const pluginName = (name ?? own.name ?? path.basename(pluginDir)).trim()
  if (pluginName === '') throw new Error('The plugin needs a name: give its package.json a name, or pass --name')
  const target = await pluginTarget(pluginDir, own, projectDir)
  const styles = path.join(pluginDir, 'protobase-plugin.css')

  // React's production build and JSX runtime, whatever NODE_ENV says (see buildShell).
  const nodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  const result = await build({
    configFile: false,
    root: pluginDir,
    base: './',
    mode: 'production',
    publicDir: false,
    logLevel: 'warn',
    plugins: [
      pluginImports(),
      ...(projectDir === undefined ? [] : [extensionImports(projectDir, [{ dir: pluginDir }])]),
      pluginStyles(styles, styleCode(pluginDir, target.theme, [outDir, ...ignore])),
      react(),
      tailwindcss(),
      layeredStyles(),
    ],
    // Web workers are builds of their own, which take the source maps from `build` but not the output's debug ids.
    worker: { rolldownOptions: { output: { sourcemapDebugIds: sourceMaps } } },
    build: {
      outDir,
      emptyOutDir: true,
      modulePreload: false,
      sourcemap: sourceMaps && 'hidden',
      rolldownOptions: {
        input: { index: entry, styles },
        // The entry keeps every export: the app reads the components and the default export from it.
        preserveEntrySignatures: 'strict',
        output: { entryFileNames: 'assets/[name]-[hash].js', chunkFileNames: 'assets/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]', sourcemapDebugIds: sourceMaps },
      },
    },
  }).finally(() => {
    if (nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = nodeEnv
  })

  const output = outputOf(result).output
  const module = output.find((file) => file.type === 'chunk' && file.isEntry && file.facadeModuleId === entry)
  const css = output.find((file) => file.type === 'asset' && file.fileName.endsWith('.css'))
  if (!module || !css) throw new Error('The plugin build wrote no module or no stylesheet')
  const fields = await pluginFieldTypes({ pluginDir, entry, uiDir: target.uiDir, projectDir })
  const manifest: PluginManifest = {
    name: pluginName,
    ...(own.version && { version: own.version }),
    api: target.api,
    protobase: target.protobase,
    entry: module.fileName,
    css: css.fileName,
    ...(Object.keys(fields).length > 0 && { fields }),
  }
  await writeFile(path.join(outDir, pluginManifestFile), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}
