import { existsSync } from 'node:fs'
import path from 'node:path'
import { moduleFile } from '../module-file'
import { exportOrder } from './export-order'
import { conventionModules } from '../config/project-files'
import { configFileOf } from '../config/read-config'
import { uiDirs } from '../project/convention-files'
import type { Extension } from '../project/extensions'
import { functionFiles } from '../project/functions-folder'

const conventionModule = moduleFile('../project/convention', import.meta.url)

const json = (value: unknown) => JSON.stringify(value)

// The code a folder's conventions find, as references to its files (see `BundleFiles`): config/index.ts with every
// config/*/ui.ts, ./functions, and the jobs, hooks, auth hooks and roles files.
const filesCode = (dir: string) => {
  const configDir = path.join(dir, 'config')
  const index = path.join(configDir, 'index.ts')
  // The namespace sorts the index's names; the convention keeps the order the source declares, as in `protobase dev`
  const resources = existsSync(index)
    ? `resources: async () => conventionConfig(await import(${json(index)}), [${uiDirs(configDir).map((ui) => `[${json(ui)}, await import(${json(path.join(configDir, ui, 'ui.ts'))})]`).join(', ')}], ${json(exportOrder(index))}), `
    : ''
  const functions = functionFiles(dir).map(({ name, file }) => `${json(name)}: () => import(${json(file)})`).join(', ')
  const modules = conventionModules(dir).map((file) => `${json(file)}: () => import(${json(path.join(dir, file))})`).join(', ')
  return `{ ${resources}functions: { ${functions} }, modules: { ${modules} } }`
}

// The config's default export, as a module binding: a TypeScript module's default, or the JSON object.
const configCode = (file: string | undefined, name: string) => {
  if (!file) return [`const ${name} = {}`]
  if (file.endsWith('.json')) return [`import ${name} from ${json(file)}`]
  return [`import * as ${name}Module from ${json(file)}`, `const ${name} = ${name}Module.default`]
}

/**
 * The bundle's config module (see `BundleModule`): the project's config and the extensions' as they are, the code
 * their conventions find as references to its files, and the packages the config names. The serve runtime reads the
 * configs again with its own environment, and merges them as `protobase dev` does.
 */
export const bundleEntryCode = (projectDir: string, extensions: Extension[] = [], packages: string[] = []) => {
  const file = configFileOf(projectDir)
  if (!file && !existsSync(path.join(projectDir, 'config', 'index.ts'))) throw new Error(`No protobase.config.ts, protobase.config.json or config/index.ts in ${projectDir}`)
  const configs = extensions.flatMap((extension) => (extension.config ? [extension] : []))
  const lines = [
    `import { conventionConfig } from ${json(conventionModule)}`,
    ...configCode(file, 'config'),
    `export const own = { config, label: ${json(file ? path.basename(file) : 'config/index.ts')}, files: ${filesCode(projectDir)} }`,
    ...configs.flatMap((extension, i) => configCode(extension.config, `extension${i}`)),
    `export const extensions = [${configs.map((extension, i) => `{ config: extension${i}, label: ${json(path.basename(extension.dir))}, files: ${filesCode(extension.dir)} }`).join(', ')}]`,
    `export const packages = { ${packages.map((name) => `${json(name)}: () => import(${json(name)})`).join(', ')} }`,
  ]
  return `${lines.join('\n')}\n`
}
