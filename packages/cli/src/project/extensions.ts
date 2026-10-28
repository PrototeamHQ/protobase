import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { adminAppDir } from './admin-app'
import { protobaseFolder } from './protobase-folder'

// An extension's folder (`--extend <dir>`) and the configs it holds: a protobase.config.ts, a protobase.ui.tsx or both.
export type Extension = { dir: string; config?: string; ui?: string }

export const extensionConfigFile = 'protobase.config.ts'
export const extensionUiFile = 'protobase.ui.tsx'

export const resolveExtensions = (dirs: string[]): Extension[] =>
  dirs.map((given) => {
    const resolved = path.resolve(given)
    if (!existsSync(resolved)) throw new Error(`--extend ${given}: there is no folder ${resolved}`)
    // Bundlers name modules by their real path, which is how an extension's own imports are told apart.
    const dir = realpathSync(resolved)
    const config = path.join(dir, extensionConfigFile)
    const ui = path.join(dir, extensionUiFile)
    const extension = { dir, ...(existsSync(config) && { config }), ...(existsSync(ui) && { ui }) }
    if (!extension.config && !extension.ui) throw new Error(`--extend ${given}: ${dir} has neither ${extensionConfigFile} nor ${extensionUiFile}`)
    return extension
  })

// The packages an extension shares with the app, so it runs on the app's own versions of them.
const shared = /^(@protobase\/[^/]+|react|react-dom)(\/.*)?$/

const inside = (file: string, dir: string) => file === dir || file.startsWith(`${dir}${path.sep}`)

// An extension's imports of @protobase/*, react and react-dom resolve from the project, as if one of its files had
// written them; the rest resolve from the extension's own folder.
export const extensionImports = (projectDir: string, extensions: Extension[]): Plugin => ({
  name: 'protobase-extension-imports',
  enforce: 'pre',
  async resolveId(id, importer, options) {
    if (!importer || !shared.test(id)) return undefined
    const from = importer.replace(/^\0/, '').replace(/\?.*$/, '')
    if (!extensions.some((extension) => inside(from, extension.dir))) return undefined
    return this.resolve(id, path.join(projectDir, extensionConfigFile), { ...options, skipSelf: true })
  },
})

// The admin app's stylesheet, beside its app folder in @protobase/ui's src and dist alike.
const appStyles = path.join(path.dirname(adminAppDir), 'styles.css')

// The project's build output (`protobase build`'s default `--out`) and generated files are not its sources.
const projectSources = (projectDir: string, extensions: Extension[]) => [
  `@source ${JSON.stringify(projectDir)};`,
  `@source not ${JSON.stringify(path.join(projectDir, 'dist'))};`,
  `@source not ${JSON.stringify(path.join(projectDir, protobaseFolder))};`,
  ...extensions.map((extension) => `@source ${JSON.stringify(extension.dir)};`),
]

// Tailwind scans the dev server's root, the admin app's folder, and the folder its stylesheet names, never the project's;
// so the app's stylesheet names the project's folder and each extension's as sources too. Tailwind skips node_modules.
export const projectStyles = (projectDir: string, extensions: Extension[]): Plugin => ({
  name: 'protobase-project-styles',
  enforce: 'pre',
  transform: (code, id) => {
    if (id.replace(/\?.*$/, '') !== appStyles) return undefined
    return `${code}\n${projectSources(projectDir, extensions).join('\n')}\n`
  },
})
