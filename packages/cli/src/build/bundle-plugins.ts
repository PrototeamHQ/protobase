import { existsSync } from 'node:fs'
import path from 'node:path'
import type { BundlePlugin } from '../bundle/manifest'
import type { Extension } from '../project/extensions'
import { projectUiFile } from '../project/project-ui'
import { readPackageJson } from './packages/package-dir'
import { buildPlugin, pluginManifestFile } from './plugin-build'

/** The name of the plugin a project's own protobase.ui.tsx becomes, and its folder under `plugins/`. */
export const projectPluginName = 'app'

/** Where a bundle's plugins go, inside its `public` folder. */
export const pluginsFolder = 'plugins'

type Source = { dir: string; name: string; stylesOnly?: boolean }

// An extension's plugin is named by its package.json, else by its folder.
const extensionName = async (extension: Extension) => {
  const own = existsSync(path.join(extension.dir, 'package.json')) ? await readPackageJson(extension.dir) : {}
  return own.name ?? path.basename(extension.dir)
}

// A plugin's folder under plugins/: its name, without a scope's @ and with anything but letters, digits, dots and dashes
// as dashes.
const folderOf = (name: string) => name.replace(/^@/, '').replace(/[^\w.-]+/g, '-')

// The project's plugin: its protobase.ui.tsx, else its stylesheet alone when `styles` asks for one, else none.
const ownSource = (projectDir: string, styles: boolean): Source[] => {
  if (existsSync(projectUiFile(projectDir))) return [{ dir: projectDir, name: projectPluginName }]
  return styles ? [{ dir: projectDir, name: projectPluginName, stylesOnly: true }] : []
}

// The UI configs a bundle carries as plugins, in the order the app merges them: the extensions' first, the project's last.
const sources = async (projectDir: string, extensions: Extension[], styles: boolean): Promise<Source[]> => {
  const own = ownSource(projectDir, styles)
  const extended = await Promise.all(extensions.filter((extension) => extension.ui).map(async (extension) => ({ dir: extension.dir, name: await extensionName(extension) })))
  const all = [...extended, ...own]
  const seen = new Map<string, string>()
  for (const source of all) {
    const other = seen.get(folderOf(source.name))
    if (other) throw new Error(`${other} and ${source.dir} would both be the plugin ${folderOf(source.name)}; give the extension's package.json another name`)
    seen.set(folderOf(source.name), source.dir)
  }
  return all
}

/**
 * Builds the project's protobase.ui.tsx and each extension's as a plugin under `publicDir`/plugins/<name>/, as
 * `protobase build-plugin` builds one: the app loads them like any other, from what `/meta` names. With `styles`, a
 * project without a protobase.ui.tsx gets a plugin too, of its stylesheet alone, for the Tailwind classes in its files.
 */
export const buildBundlePlugins = async ({
  projectDir,
  publicDir,
  extensions,
  styles = false,
  ignore,
  sourceMaps,
}: {
  projectDir: string
  publicDir: string
  extensions: Extension[]
  styles?: boolean
  ignore: string[]
  sourceMaps: boolean
}): Promise<BundlePlugin[]> => {
  const plugins: BundlePlugin[] = []
  // One after another: each is a Vite build, and the order is the manifest's.
  for (const source of await sources(projectDir, extensions, styles)) {
    const folder = path.join(pluginsFolder, folderOf(source.name))
    const manifest = await buildPlugin({ pluginDir: source.dir, outDir: path.join(publicDir, folder), name: source.name, projectDir, ignore, sourceMaps, stylesOnly: source.stylesOnly })
    plugins.push({ name: manifest.name, path: `${folder}/${pluginManifestFile}`, api: manifest.api, protobase: manifest.protobase, ...(manifest.fields && { fields: manifest.fields }) })
  }
  return plugins
}
