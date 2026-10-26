import path from 'node:path'
import type { Plugin } from 'vite'

// Imports project files through Vite's module runner, which transforms the project's files and imports its packages
// as they are. Node needs it for the project's extensionless imports; it costs about a second, so Bun skips it.
const runnerImport = async (file: string, plugins: Plugin[] = []) => {
  const vite = await import('vite')
  const { module } = await vite.runnerImport<Record<string, unknown>>(file, { configFile: false, logLevel: 'error', plugins })
  return module
}

// Imports one of the project's TypeScript files: Bun loads it itself, Node through Vite's module runner.
export const importProjectFile = async (file: string): Promise<Record<string, unknown>> =>
  process.versions.bun ? import(file) : runnerImport(file)

/**
 * Imports several of the project's files in order, so that the modules they share are loaded once. Bun's module cache
 * does that itself; Vite's runner gets them as the imports of one module, which need not exist, beside the first file.
 */
export const importProjectFiles = async (files: string[]): Promise<Array<Record<string, unknown>>> => {
  if (process.versions.bun) {
    const modules = []
    for (const file of files) modules.push(await importProjectFile(file))
    return modules
  }
  const id = path.join(path.dirname(files[0]!), 'protobase-project-files.js')
  const code = [...files.map((file, i) => `import * as m${i} from ${JSON.stringify(file)}`), `export const modules = [${files.map((_, i) => `m${i}`).join(', ')}]`].join('\n')
  const loaded = await runnerImport(id, [
    {
      name: 'protobase-project-files',
      resolveId: (source) => (source === id ? `\0${id}` : undefined),
      load: (source) => (source === `\0${id}` ? code : undefined),
    },
  ])
  return loaded.modules as Array<Record<string, unknown>>
}
