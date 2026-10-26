import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ConfigEnv, ConfigInput } from '@protobase/config'
import { calledConfig } from './called-config'
import { lazyImports, type Node } from './lazy-imports'

/**
 * Imports modules of the project by their files, as the command loads the project's code (Bun itself, or Vite), so
 * that the modules they share load once.
 */
export type ImportModules = (files: string[]) => Promise<Array<Record<string, unknown>>>

export const configFiles = ['protobase.config.ts', 'protobase.config.json'] as const

/** The project's one config file: protobase.config.ts or protobase.config.json, never both; `undefined` without one. */
export const configFileOf = (dir: string) => {
  const found = configFiles.map((name) => path.join(dir, name)).filter((file) => existsSync(file))
  if (found.length > 1) throw new Error(`${dir} has both protobase.config.ts and protobase.config.json; a project has one config file, so remove one of them`)
  return found[0]
}

// The parser, Rust, loaded on first use: about 20 ms.
const parser = async () => import('rolldown/utils')

// A TypeScript config's default export, refused when its source loads any part of itself later with `import()`.
const typescriptInput = async (file: string, importModules: ImportModules): Promise<ConfigInput> => {
  const { parseSync } = await parser()
  const parsed = parseSync(file, await readFile(file, 'utf8'))
  if (parsed.errors.length > 0) throw new Error(`${file}: ${parsed.errors[0]!.message}`)
  const lazy = lazyImports(parsed.program as unknown as Node)
  if (lazy.length > 0) {
    throw new Error(`${path.basename(file)} imports ${lazy.map((name) => `"${name}"`).join(', ')} lazily; a config is one object, so import a value it holds statically, and leave code to the files the framework finds (jobs/<name>.ts, hooks/<name>.ts, auth/hooks.ts)`)
  }
  const [module] = await importModules([file])
  if (module!.default === undefined) throw new Error(`${file} has no default export: export default defineConfig({ ... })`)
  return module!.default as ConfigInput
}

/** The config of a config file: a JSON object, or a TypeScript module's default export, called with `configEnv`. */
export const readConfigFile = async (file: string, configEnv: ConfigEnv, importModules: ImportModules) => {
  const input = file.endsWith('.json') ? (JSON.parse(await readFile(file, 'utf8')) as ConfigInput) : await typescriptInput(file, importModules)
  return calledConfig(input, configEnv, path.basename(file))
}
