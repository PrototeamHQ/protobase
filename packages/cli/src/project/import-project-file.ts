import { pathToFileURL } from 'node:url'
import { tsImport } from 'tsx/esm/api'

// Imports one of the project's TypeScript files, which use extensionless imports that Node cannot load on its own.
export const importProjectFile = (file: string): Promise<Record<string, unknown>> => tsImport(pathToFileURL(file).href, import.meta.url)
