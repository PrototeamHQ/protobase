import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { findPackageDirSync } from '../build/packages/package-dir'
import { adminAppDir, adminAppMain, uiPackageDir } from './admin-app'

// The CLI's own package folder, from src/project in this repository and from dist/project when installed.
const cliDir = fileURLToPath(new URL('../..', import.meta.url))

// What a project's page code shares with the admin app: the @protobase packages, React and React DOM.
const shared = /^(@protobase\/[^/]+|react|react-dom)(\/.*)?$/

// Importers the admin app's copies are found from: its own entry for React and the packages @protobase/ui depends on,
// the CLI for @protobase/ui itself and the rest of the @protobase packages.
const appImporter = path.join(adminAppDir, adminAppMain)
const cliImporter = path.join(cliDir, 'package.json')

/** The folders of the packages a bundled project's page code gets from the CLI, which the dev server must serve. */
export const bundledPackageDirs = () =>
  [uiPackageDir, ...['react', 'react-dom', '@protobase/client', '@protobase/layout', '@protobase/schema'].map((name) => findPackageDirSync(name, uiPackageDir))].filter(
    (dir): dir is string => dir !== undefined,
  )

const inside = (file: string, dir: string) => file === dir || file.startsWith(`${dir}${path.sep}`)

/**
 * In a bundled project, the page code's imports of the @protobase packages, React and React DOM resolve to the admin
 * app's own copies, from the CLI, whatever the project installed: one copy of each, of the version the API runs, as the
 * serve runtime's shell supplies them once deployed. `projectDirs` are the project's folder and its extensions'.
 */
export const bundledImports = (projectDirs: string[]): Plugin => ({
  name: 'protobase-bundled-imports',
  enforce: 'pre',
  async resolveId(id, importer, options) {
    if (!importer || !shared.test(id)) return undefined
    const from = importer.replace(/^\0/, '').replace(/\?.*$/, '')
    if (!projectDirs.some((dir) => inside(from, dir))) return undefined
    const own = id === '@protobase/ui' || id.startsWith('@protobase/ui/')
    const resolved = own ? undefined : await this.resolve(id, appImporter, { ...options, skipSelf: true })
    return resolved ?? this.resolve(id, cliImporter, { ...options, skipSelf: true })
  },
})
