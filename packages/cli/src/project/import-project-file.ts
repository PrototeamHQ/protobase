import { runnerImport } from 'vite'

// Imports one of the project's TypeScript files, which use extensionless imports that neither Node nor every Bun
// loader resolves on its own. Vite's module runner transforms the project's files and imports its packages as they
// are, the same under Node and Bun.
export const importProjectFile = async (file: string): Promise<Record<string, unknown>> => {
  const { module } = await runnerImport<Record<string, unknown>>(file, { configFile: false, logLevel: 'error' })
  return module
}
