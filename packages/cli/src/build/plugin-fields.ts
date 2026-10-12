import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Plugin } from 'vite'
import { extensionImports } from '../project/extensions'
import { sharedModules } from '../project/shared-modules'
import { viteBundle } from './vite-bundle'

// A module standing in for a file in the plugin's folder, so its imports resolve from there: it loads the plugin's
// protobase.ui.tsx as the app does and gives the field types it registers, each with the storage types it shows.
const fieldsCode = (entry: string) =>
  [
    `import * as ui from ${JSON.stringify(entry)}`,
    `import { mergeUi, uiFromModule } from '@protobase/ui'`,
    'const { fields = {} } = mergeUi(uiFromModule(ui))',
    'export default Object.fromEntries(Object.entries(fields).map(([name, type]) => [name, type.of]))',
    '',
  ].join('\n')

const fieldsEntry = (file: string, code: string): Plugin => ({
  name: 'protobase-plugin-fields',
  resolveId: (id) => (id === file ? `\0${file}` : undefined),
  load: (id) => (id === `\0${file}` ? code : undefined),
})

// React's packages as the app has them: the plugin imports them without depending on them, so they resolve from the
// @protobase/ui it is built with. Node's resolution finds them, not the other resolvers: the project's (extensionImports)
// takes a @protobase/ui installed inside the project for one of its files and would hand them back here without end.
const sharedFromUi = (uiDir: string): Plugin => {
  const require = createRequire(path.join(uiDir, 'package.json'))
  return {
    name: 'protobase-plugin-fields-shared',
    enforce: 'pre',
    resolveId: (id) => (id === '@protobase/ui' || !(sharedModules as readonly string[]).includes(id) ? undefined : require.resolve(id)),
  }
}

const isStorageTypes = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

/**
 * The field types a plugin registers (`definePlugin({ fields })`), each with the storage types it shows (`of`), which
 * the server checks the views against at startup. The plugin's module is loaded once in Node, everything bundled into
 * a scratch file, as `protobase build` loads a project's UI to check its names; nothing is rendered.
 */
export const pluginFieldTypes = async ({ pluginDir, entry, uiDir, projectDir }: { pluginDir: string; entry: string; uiDir: string; projectDir?: string }): Promise<Record<string, string[]>> => {
  const file = path.join(pluginDir, 'protobase-plugin-fields.js')
  const scratch = await mkdtemp(path.join(tmpdir(), 'protobase-plugin-fields-'))
  // .mjs: a scratch folder has no package.json saying its .js files are ES modules
  const outFile = path.join(scratch, 'fields.mjs')
  try {
    const plugins = [fieldsEntry(file, fieldsCode(entry)), sharedFromUi(uiDir), ...(projectDir === undefined ? [] : [extensionImports(projectDir, [{ dir: pluginDir }])])]
    await viteBundle({ root: pluginDir, entry: file, outFile, plugins, logLevel: 'error' })
    const fields = (await import(pathToFileURL(outFile).href)).default as Record<string, unknown>
    const wrong = Object.entries(fields).find(([, of]) => !isStorageTypes(of))
    if (wrong) throw new Error(`The field type "${wrong[0]}" names no storage types it shows; give it of: ['integer'] or the like`)
    return fields as Record<string, string[]>
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
