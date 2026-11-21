import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Plugin } from 'vite'
import { bundledImports } from '../project/bundled-imports'
import { extensionImports } from '../project/extensions'
import { sharedModules } from '../project/shared-modules'
import { viteBundle } from './vite-bundle'

// A module standing in for a file in the plugin's folder, so its imports resolve from there: it loads the plugin's
// protobase.ui.tsx as the app does and gives the field types it registers, each with the storage types it shows, and
// the extension points it fills, as its @protobase/ui reads them (none when that @protobase/ui does not say).
const configCode = (entry: string) =>
  [
    `import * as ui from ${JSON.stringify(entry)}`,
    `import * as protobaseUi from '@protobase/ui'`,
    'const merged = protobaseUi.mergeUi(protobaseUi.uiFromModule(ui))',
    'const { fields = {} } = merged',
    'export default {',
    '  fields: Object.fromEntries(Object.entries(fields).map(([name, type]) => [name, type.of])),',
    '  extensionPoints: protobaseUi.extensionPointsOf?.(merged),',
    '}',
    '',
  ].join('\n')

const configEntry = (file: string, code: string): Plugin => ({
  name: 'protobase-plugin-config',
  resolveId: (id) => (id === file ? `\0${file}` : undefined),
  load: (id) => (id === `\0${file}` ? code : undefined),
})

// React's packages as the app has them: the plugin imports them without depending on them, so they resolve from the
// @protobase/ui it is built with. Node's resolution finds them, not the other resolvers: the project's (extensionImports)
// takes a @protobase/ui installed inside the project for one of its files and would hand them back here without end.
const sharedFromUi = (uiDir: string): Plugin => {
  const require = createRequire(path.join(uiDir, 'package.json'))
  return {
    name: 'protobase-plugin-config-shared',
    enforce: 'pre',
    resolveId: (id) => (id === '@protobase/ui' || !(sharedModules as readonly string[]).includes(id) ? undefined : require.resolve(id)),
  }
}

const isNames = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

/** What a plugin's UI config registers and fills, which plugin.json records. */
export type PluginConfig = { fields: Record<string, string[]>; extensionPoints: string[] }

/**
 * The field types a plugin registers (`definePlugin({ fields })`), each with the storage types it shows (`of`), which
 * the server checks the views against at startup, and the extension points it fills, which the app checks it has
 * before it loads the plugin (see `extensionPointsOf` in @protobase/ui). The plugin's module is loaded once in Node, everything bundled into
 * a scratch file, as `protobase build` loads a project's UI to check its names; nothing is rendered. A plugin of a
 * bundled project imports the CLI's @protobase packages, as its build does.
 */
export const readPluginConfig = async ({
  pluginDir,
  entry,
  uiDir,
  projectDir,
  bundled = false,
}: {
  pluginDir: string
  entry: string
  uiDir: string
  projectDir?: string
  bundled?: boolean
}): Promise<PluginConfig> => {
  const file = path.join(pluginDir, 'protobase-plugin-config.js')
  const scratch = await mkdtemp(path.join(tmpdir(), 'protobase-plugin-config-'))
  // .mjs: a scratch folder has no package.json saying its .js files are ES modules
  const outFile = path.join(scratch, 'config.mjs')
  try {
    const plugins = [
      configEntry(file, configCode(entry)),
      sharedFromUi(uiDir),
      ...(bundled && projectDir !== undefined ? [bundledImports([projectDir, pluginDir])] : []),
      ...(projectDir === undefined ? [] : [extensionImports(projectDir, [{ dir: pluginDir }])]),
    ]
    await viteBundle({ root: pluginDir, entry: file, outFile, plugins, logLevel: 'error' })
    const { fields, extensionPoints } = (await import(pathToFileURL(outFile).href)).default as { fields: Record<string, unknown>; extensionPoints: unknown }
    const wrong = Object.entries(fields).find(([, of]) => !isNames(of))
    if (wrong) throw new Error(`The field type "${wrong[0]}" names no storage types it shows; give it of: ['integer'] or the like`)
    if (!isNames(extensionPoints)) throw new Error(`The @protobase/ui in ${uiDir} does not name the extension points a plugin fills; install a version that does`)
    return { fields: fields as Record<string, string[]>, extensionPoints }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
