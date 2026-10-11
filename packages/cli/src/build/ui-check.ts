import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Plugin } from 'vite'
import { extensionImports, type Extension } from '../project/extensions'
import { projectUiFile, projectUiId, projectUiPlugin } from '../project/project-ui'
import { viteBundle } from './vite-bundle'

// A module standing in for a file in the project, so its import of @protobase/ui resolves from there: it loads the
// project's UI as the app does and gives the names of the components it registers.
const checkFile = (projectDir: string) => path.join(projectDir, 'protobase-ui-check.js')

const checkCode = [
  `import * as ui from '${projectUiId}'`,
  `import { mergeUi, uiFromModule } from '@protobase/ui'`,
  'export default Object.keys(mergeUi(uiFromModule(ui)).components ?? {})',
  '',
].join('\n')

const checkEntry = (file: string): Plugin => ({
  name: 'protobase-ui-check',
  resolveId: (id) => (id === file ? `\0${file}` : undefined),
  load: (id) => (id === `\0${file}` ? checkCode : undefined),
})

// The components the project's UI registers, its own and its extensions', loaded once in Node with everything bundled
// into a scratch file. Two UI configs defining the same component or action handler throw here, naming both.
const registeredComponents = async (projectDir: string, extensions: Extension[]): Promise<string[]> => {
  if (!existsSync(projectUiFile(projectDir)) && !extensions.some((extension) => extension.ui)) return []
  const scratch = await mkdtemp(path.join(tmpdir(), 'protobase-ui-check-'))
  // .mjs: a scratch folder has no package.json saying its .js files are ES modules, so Node with tsx would require it
  const outFile = path.join(scratch, 'ui-check.mjs')
  try {
    // Bundling React libraries for Node warns about their "use client" directives, which do not matter here.
    const plugins = [checkEntry(checkFile(projectDir)), projectUiPlugin(projectDir, extensions), extensionImports(projectDir, extensions)]
    await viteBundle({ root: projectDir, entry: checkFile(projectDir), outFile, plugins, logLevel: 'error' })
    return (await import(pathToFileURL(outFile).href)).default as string[]
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

/**
 * Fails the build, instead of the app in the browser, when two UI configs define the same component or action
 * handler, or when the config declares a component with `component('Name')` that protobase.ui.tsx does not export.
 * It loads only browser code, which needs no secrets; nothing is rendered.
 */
export const checkUi = async (projectDir: string, extensions: Extension[], declared: ReadonlySet<string>) => {
  if (declared.size === 0 && !extensions.some((extension) => extension.ui)) return
  const registered = new Set(await registeredComponents(projectDir, extensions))
  const missing = [...declared].filter((name) => !registered.has(name)).sort()
  if (missing.length === 0) return
  throw new Error(
    `The config declares ${missing.map((name) => `component('${name}')`).join(', ')}, but protobase.ui.tsx exports no component by ${missing.length === 1 ? 'that name' : 'those names'}. Export each from its own file and re-export it, such as: export { ${missing[0]} } from './ui/${missing[0]}'`,
  )
}
