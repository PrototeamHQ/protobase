import { runnerImport, type Plugin } from 'vite'

// Imports one of the project's TypeScript files, which use extensionless imports that neither Node nor every Bun
// loader resolves on its own. Vite's module runner transforms the project's files and imports its packages as they
// are, the same under Node and Bun.
export const importProjectFile = async (file: string, plugins: Plugin[] = []): Promise<Record<string, unknown>> => {
  const { module } = await runnerImport<Record<string, unknown>>(file, { configFile: false, logLevel: 'error', plugins })
  return module
}

/**
 * Imports `code` as if it were the project's file `file`, which need not exist: its imports resolve from there, and
 * the modules it imports are loaded once, however many of them import each other.
 */
export const importProjectCode = (file: string, code: string) =>
  importProjectFile(file, [
    {
      name: 'protobase-project-code',
      resolveId: (id) => (id === file ? `\0${file}` : undefined),
      load: (id) => (id === `\0${file}` ? code : undefined),
    },
  ])
