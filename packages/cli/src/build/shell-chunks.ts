import { createRequire } from 'node:module'
import path from 'node:path'
import { uiEntry } from '../project/admin-app'

// The shell's chunks. What the start loads, index.html's script and @protobase/ui's entry for plugins with all they
// import statically, is a few large chunks rather than many small ones, which a WebView loads one module at a time:
// React in `react`, which changes only with React, the other third-party modules in `vendor`, and Protobase's own in
// `app`, so a Protobase update downloads mostly `app`. The pages and features the app loads lazily, such as the
// record page or the charts, are chunks of their own, each third-party package they bring in a `lib-` chunk, which
// changes only with that package. The workflow engine's modules, which the workflow fields, editor and step catalog
// load, go in `workflows`: they import only each other and libraries, so that chunk changes only with the engine.

/**
 * The npm package a module id belongs to, as the last `node_modules` segment of its path names it, since Bun's store
 * nests packages as `node_modules/.bun/<package>@<version>/node_modules/<package>`; none for a module outside one.
 */
export const npmPackage = (id: string) => /.*node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(id)?.[1]?.replace('\\', '/')

const reactPackages = new Set(['react', 'react-dom', 'scheduler'])

/** Whether a module goes in the `react` chunk. */
export const isReactModule = (id: string) => reactPackages.has(npmPackage(id) ?? '')

/**
 * Whether a module goes in `vendor` or its package's `lib-` chunk: a third-party one but React's and the icons'. The
 * icons stay with the code that draws them, since the app picks up a new one on many releases, which would change the
 * chunk they are in and every chunk that imports it.
 */
export const isLibModule = (id: string) => {
  const name = npmPackage(id)
  return name !== undefined && !reactPackages.has(name) && name !== 'lucide-react'
}

// Vite's helper for lazy imports, which the start's own lazy imports use: in `vendor`, since rolldown would otherwise put
// it in whichever chunk first imports something lazily, such as a library's, which the start would then load.
const preloadHelper = '\0vite/preload-helper.js'

// The folder of @protobase/workflows as @protobase/ui resolves it, symlinks resolved: packages/workflows in this
// repository, where the shell is built from.
const workflowsDir = path.resolve(path.dirname(createRequire(uiEntry).resolve('@protobase/workflows')), '..')

// A path with forward slashes, as Vite gives module ids on every platform.
const slashed = (file: string) => file.replaceAll('\\', '/')

/** Whether a module is one of the workflow engine's, which go in the `workflows` chunk: inside its folder, not beside it. */
export const isWorkflowsModule = (id: string, dir = workflowsDir) => slashed(id).startsWith(`${slashed(dir).replace(/\/$/, '')}/`)

/**
 * Whether a module is the app's own code: no third-party one, no virtual module, page, stylesheet or workflow engine's.
 * index.html's own script stays in its entry chunk, which then only imports `app`.
 */
export const isAppModule = (id: string) => npmPackage(id) === undefined && !id.startsWith('\0') && !/\.(css|html)(\?|$)/.test(id) && !isWorkflowsModule(id)

/** The chunk name of a third-party module: its package's, such as `lib-xyflow-react`. */
export const libChunkName = (id: string) => `lib-${npmPackage(id)!.replace('@', '').replace('/', '-')}`

/**
 * The shell build's `output.codeSplitting`, by priority. `react` comes first: without it, `vendor` would take React in
 * as a dependency of the libraries it holds, and lazy chunks would import it from there. `$initial` is what an entry
 * imports statically. A `lib-` chunk takes in none of its package's dependencies, which may be another package's too:
 * the charts' would otherwise hold a module the table's library imports, and a list would load the charts.
 */
export const shellCodeSplitting = {
  groups: [
    { name: 'react', test: isReactModule, priority: 3 },
    { name: 'vendor', test: (id: string) => isLibModule(id) || id === preloadHelper, tags: ['$initial' as const], priority: 2 },
    { name: 'app', test: isAppModule, tags: ['$initial' as const], priority: 2 },
    { name: libChunkName, debugName: 'lib', test: isLibModule, priority: 1, includeDependenciesRecursively: false },
    { name: 'workflows', test: (id: string) => isWorkflowsModule(id) },
  ],
}
