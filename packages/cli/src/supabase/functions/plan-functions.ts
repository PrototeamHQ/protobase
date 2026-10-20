import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { convertSource } from './convert-source'
import { readImportMap, type ImportMap } from './import-map'
import { publicFunctions } from './public-functions'
import type { ImportedPackage } from './specifier'

/** A file the conversion writes, its path relative to the project. */
export type PlannedFile = { path: string; content: string | Buffer }

export type FunctionsPlan = {
  files: PlannedFile[]
  /** Each converted function, and whether it is open to anyone. */
  functions: Array<{ name: string; public: boolean }>
  /** The packages the functions import, the first range asked for each. */
  packages: ImportedPackage[]
  /** What needs a person or the AI skill, each a line of the report. */
  left: string[]
}

const code = /\.(ts|tsx|mts|js|jsx|mjs)$/

// Deno's own files, which the conversion reads instead of copying.
const denoFiles = new Set(['deno.json', 'deno.jsonc', 'deno.lock', 'import_map.json'])

const importMapOf = async (dir: string): Promise<ImportMap> => {
  const maps = await Promise.all(['import_map.json', 'deno.json', 'deno.jsonc'].map(async (name) => {
    const file = path.join(dir, name)
    return existsSync(file) ? readImportMap(file, await readFile(file, 'utf8')) : {}
  }))
  return Object.assign({}, ...maps)
}

const filesBelow = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name)).sort()
}

/**
 * How `supabase/functions` becomes the project's `functions/`, without writing anything: every function folder, and
 * the shared ones such as `_shared`, with its code converted (`convertSource`) and its other files as they are.
 * `verify_jwt = false` in `supabase/config.toml` makes a function public. A folder without an `index.ts` is left out
 * and reported. Fails when the project's `functions/` has a function or folder of a name it would write.
 */
export const planFunctions = async (projectDir: string): Promise<FunctionsPlan> => {
  const from = path.join(projectDir, 'supabase', 'functions')
  const plan: FunctionsPlan = { files: [], functions: [], packages: [], left: [] }
  if (!existsSync(from)) return plan
  const config = path.join(projectDir, 'supabase', 'config.toml')
  const open = existsSync(config) ? publicFunctions(await readFile(config, 'utf8')) : new Set<string>()
  const sharedMap = await importMapOf(from)
  const folders = (await readdir(from, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name).sort()

  const taken = folders.filter((name) => existsSync(path.join(projectDir, 'functions', name)) || existsSync(path.join(projectDir, 'functions', `${name}.ts`)))
  if (taken.length > 0) throw new Error(`The project's functions/ already has ${taken.join(', ')}; move them aside to import supabase/functions`)

  for (const name of folders) {
    const dir = path.join(from, name)
    const shared = name.startsWith('_')
    if (!shared && !existsSync(path.join(dir, 'index.ts'))) {
      plan.left.push(`supabase/functions/${name} has no index.ts, so it was not imported: move its entry point there`)
      continue
    }
    const importMap = { ...sharedMap, ...(await importMapOf(dir)) }
    for (const file of await filesBelow(dir)) {
      const relative = path.relative(projectDir, file).replace(/^supabase[/\\]/, '')
      if (denoFiles.has(path.basename(file))) continue
      if (!code.test(file)) {
        plan.files.push({ path: relative, content: await readFile(file) })
        continue
      }
      const converted = convertSource(await readFile(file, 'utf8'), { file: relative, entry: !shared && file === path.join(dir, 'index.ts'), public: open.has(name), importMap })
      plan.files.push({ path: relative, content: converted.code })
      plan.left.push(...converted.left)
      for (const pkg of converted.packages) {
        const known = plan.packages.find((other) => other.name === pkg.name)
        if (!known) plan.packages.push(pkg)
        else if (known.range !== pkg.range) plan.left.push(`${relative} asks for ${pkg.name} ${pkg.range}, another file for ${known.range}; package.json has ${known.range}`)
      }
    }
    if (!shared) plan.functions.push({ name, public: open.has(name) })
  }
  return plan
}
