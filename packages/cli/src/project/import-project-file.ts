import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { InlineConfig, Plugin } from 'vite'
import { serverPackage } from '../dev/server-package'

// Imports project files through Vite's module runner, which transforms the project's files and imports its packages
// as they are. Node needs it for the project's extensionless imports; it costs about a second, so Bun skips it in a
// locked project. A bundled project's imports of the packages the serve runtime supplies resolve to the CLI's own
// copies, as in `protobase dev`, whatever the project installed.
const runnerImport = async (file: string, projectDir: string, plugins: Plugin[] = []) => {
  const vite = await import('vite')
  const resolution = serverPackage(projectDir)
  const packages: InlineConfig = resolution.from === 'cli' ? { root: resolution.root, resolve: { dedupe: resolution.dedupe } } : {}
  const { module } = await vite.runnerImport<Record<string, unknown>>(file, { configFile: false, logLevel: 'error', plugins, ...packages })
  return module
}

// A package's own file, which Node loads as it is.
const inPackage = (file: string) => file.split(path.sep).includes('node_modules')

// Bun loads a locked project's files itself, which resolve its packages from its node_modules.
const bunLoads = (projectDir: string) => process.versions.bun !== undefined && serverPackage(projectDir).from === 'project'

/**
 * Imports one of the files of the project in `projectDir`, TypeScript: Bun loads it itself, Node through Vite's module
 * runner, or a package's file as it is. A bundled project's file always goes through the runner. `protobase dev` loads
 * this module through Vite, which leaves these imports of a path as they are.
 */
export const importProjectFile = async (file: string, projectDir: string): Promise<Record<string, unknown>> =>
  inPackage(file) ? import(/* @vite-ignore */ pathToFileURL(file).href) : bunLoads(projectDir) ? import(/* @vite-ignore */ file) : runnerImport(file, projectDir)

/**
 * Imports several of the project's files in order, so that the modules they share are loaded once. Bun's module cache
 * does that itself; Vite's runner gets them as the imports of one module, which need not exist, beside the first file.
 */
export const importProjectFiles = async (files: string[], projectDir: string): Promise<Array<Record<string, unknown>>> => {
  if (bunLoads(projectDir) || files.length === 1) {
    const modules = []
    for (const file of files) modules.push(await importProjectFile(file, projectDir))
    return modules
  }
  const id = path.join(path.dirname(files[0]!), 'protobase-project-files.js')
  const code = [...files.map((file, i) => `import * as m${i} from ${JSON.stringify(file)}`), `export const modules = [${files.map((_, i) => `m${i}`).join(', ')}]`].join('\n')
  const loaded = await runnerImport(id, projectDir, [
    {
      name: 'protobase-project-files',
      resolveId: (source) => (source === id ? `\0${id}` : undefined),
      load: (source) => (source === `\0${id}` ? code : undefined),
    },
  ])
  return loaded.modules as Array<Record<string, unknown>>
}
