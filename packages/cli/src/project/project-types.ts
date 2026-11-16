import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findPackageDirSync, packageName, type PackageJson } from '../build/packages/package-dir'
import { hostModuleIds } from '../serve/host-module-ids'
import { projectPackages } from '../version/project-packages'
import { uiPackageDir } from './admin-app'
import { protobaseFolder } from './protobase-folder'

/** The tsconfig a project's own extends, relative to the project. */
export const typesFile = path.join(protobaseFolder, 'tsconfig.json')

// The CLI's own package folder, from src/project in this repository and from dist/project when installed.
const cliDir = fileURLToPath(new URL('../..', import.meta.url))

// The packages whose types a bundled project gets from the CLI: every @protobase package and those the serve runtime
// supplies. React is one but carries no types; the project keeps @types/react, as it keeps @types/node.
const typedPackages = [...new Set(['@protobase/cli', '@protobase/client', '@protobase/ui', ...hostModuleIds.map((id) => packageName(id)!)])]

type Target = string | { [condition: string]: Target } | null

// The file an export's target is typed by: TypeScript itself, or the declarations beside JavaScript. CSS, JSON and
// an untyped script have none.
const declarationOf = (dir: string, target: Target): string | undefined => {
  if (target === null) return undefined
  if (typeof target !== 'string') {
    const chosen = target.types ?? target.import ?? target.default ?? target.require
    return chosen === undefined ? undefined : declarationOf(dir, chosen)
  }
  const file = path.join(dir, target)
  if (/\.(d\.[mc]?ts|tsx?)$/.test(file)) return existsSync(file) ? file : undefined
  if (!/\.[mc]?js$/.test(file)) return undefined
  return ['.d.ts', '.d.mts', '.d.cts'].map((extension) => file.replace(/\.[mc]?js$/, extension)).find((candidate) => existsSync(candidate))
}

// Each import of the package by name, `name` and `name/sub` for each of its exports that is no pattern, with the file
// that types it.
const packagePaths = (name: string, dir: string): Array<[string, string]> => {
  const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as PackageJson & { exports?: Target; types?: string; typings?: string; main?: string }
  const exported = manifest.exports
  const entries: Array<[string, Target]> =
    exported === undefined || exported === null
      ? [['.', manifest.types ?? manifest.typings ?? manifest.main ?? 'index.js']]
      : typeof exported === 'string' || !Object.keys(exported).every((key) => key.startsWith('.'))
        ? [['.', exported]]
        : Object.entries(exported).filter(([key]) => !key.includes('*'))
  return entries.flatMap(([sub, target]) => {
    const file = declarationOf(dir, target)
    return file ? [[`${name}${sub.slice(1)}`, file] as [string, string]] : []
  })
}

/**
 * The `paths` that point TypeScript at the CLI's own copies of the packages a bundled project gets from it, each import
 * by name, never `*`, so a package the project lacks still fails as missing.
 */
export const cliTypePaths = (ownDir = cliDir): Record<string, string[]> =>
  Object.fromEntries(
    typedPackages.flatMap((name) => {
      const dir = findPackageDirSync(name, ownDir) ?? findPackageDirSync(name, uiPackageDir)
      return dir ? packagePaths(name, dir).map(([id, file]): [string, string[]] => [id, [file]]) : []
    }),
  )

/** The declarations that register the project's config module, which typed layouts read their resources and texts from. */
export const registerFile = path.join(protobaseFolder, 'register.d.ts')

const register = [
  "// Written by protobase: the project's config module, which layout(), recordLayout() and <Trans> read the app's",
  '// resources, fields and texts from. Wrap a typed layout in page() or a view; a layout exported bare refers to itself.',
  "import type * as app from '../config/index'",
  '',
  "declare module '@protobase/layout' {",
  '  interface Register {',
  '    app: typeof app',
  '  }',
  '}',
  '',
].join('\n')

// Vite reloads every module on any write to a tsconfig.json, so an unchanged file is left alone
const writeChanged = async (file: string, content: string) => {
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return
  await writeFile(file, content)
}

/**
 * Writes `.protobase/tsconfig.json` in `projectDir`, which the project's tsconfig.json extends: in a bundled project
 * its `paths` give the @protobase packages and those the serve runtime supplies the types of the CLI that builds the
 * app, with nothing installed; a locked project's installed packages type themselves, so it holds no paths. With a
 * `config/index.ts` it also writes `.protobase/register.d.ts`, which types the layouts by the app's resources and texts,
 * and includes it beside the project's files; a project tsconfig.json with an `include` of its own lists it there. The
 * folder ignores itself in git, since the paths are this machine's. An unchanged file is left alone: Vite reloads every
 * module on any write to a tsconfig.json, so another command rewriting it would rebuild a running dev server's API.
 */
export const writeProjectTypes = async (projectDir: string) => {
  const folder = path.join(projectDir, protobaseFolder)
  await mkdir(folder, { recursive: true })
  const ignore = path.join(folder, '.gitignore')
  if (!existsSync(ignore)) await writeFile(ignore, '*\n')
  const compilerOptions = projectPackages(projectDir).mode === 'bundled' ? { paths: cliTypePaths() } : {}
  const registered = existsSync(path.join(projectDir, 'config', 'index.ts'))
  if (registered) await writeChanged(path.join(projectDir, registerFile), register)
  // Relative to this folder, as an extended tsconfig's include is: the project's own files, and the register
  const include = registered ? { include: ['../**/*', 'register.d.ts'] } : {}
  await writeChanged(path.join(projectDir, typesFile), `${JSON.stringify({ compilerOptions, ...include }, null, 2)}\n`)
}
