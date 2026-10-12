import { createRequire } from 'node:module'
import path from 'node:path'
import type { HtmlTagDescriptor, IndexHtmlTransformContext, Plugin } from 'vite'
import { uiEntry, uiPackageDir } from './admin-app'

/**
 * The modules the admin app hands to plugins: a plugin imports them by these names and runs on the app's own copies,
 * so there is one React and one @protobase/ui. Adding or removing one changes the plugin API (see `pluginApi` in
 * @protobase/ui's package.json).
 */
export const sharedModules = ['react', 'react/jsx-runtime', 'react-dom', '@protobase/ui'] as const

export type SharedModule = (typeof sharedModules)[number]

const facadePrefix = '\0protobase-shared:'

export const facadeId = (name: SharedModule) => `${facadePrefix}${name}`

/** The entry a production build gives a shared module, which names its file: `shared-react-jsx-runtime-<hash>.js`. */
export const entryName = (name: SharedModule) => `shared-${name.replace(/^@/, '').replace(/\W+/g, '-')}`

// React ships CommonJS, whose names a bundler cannot see: an entry of it would export only `default`.
const commonJs = new Set<SharedModule>(['react', 'react/jsx-runtime', 'react-dom'])

const isSharedModule = (name: string): name is SharedModule => (sharedModules as readonly string[]).includes(name)

const identifier = /^[A-Za-z_$][\w$]*$/

/**
 * The module standing for a shared one in the import map. A CommonJS package's is an ES module exporting each name the
 * package has, read with the CLI's copy of it, so a plugin's `import { useState } from 'react'` links; it imports the
 * package as the app does, so both reach the one copy. @protobase/ui's re-exports the entry the app is built from.
 */
export const facadeCode = (name: SharedModule, require = createRequire(path.join(uiPackageDir, 'package.json'))) => {
  if (!commonJs.has(name)) return `export * from ${JSON.stringify(uiEntry)}\n`
  const names = Object.keys(require(name) as object).filter((key) => key !== 'default' && identifier.test(key))
  return `import m from ${JSON.stringify(name)}\nexport default m\nexport const { ${names.join(', ')} } = m\n`
}

/** The import map, as the first tag of `<head>`: a plugin's bare imports of the shared modules resolve before any module loads. */
export const importMapTag = (imports: Record<string, string>): HtmlTagDescriptor => ({
  tag: 'script',
  attrs: { type: 'importmap' },
  children: JSON.stringify({ imports }),
  injectTo: 'head-prepend',
})

// Each shared module's URL: its entry chunk in a build, the dev server's URL of its facade (`/@id/` and the escaped
// `\0` of a virtual module) while serving.
const moduleUrls = (base: string, context: IndexHtmlTransformContext): Record<string, string> => {
  if (!context.bundle) return Object.fromEntries(sharedModules.map((name) => [name, `${base}@id/__x00__${facadeId(name).slice(1)}`]))
  const chunks = Object.values(context.bundle).flatMap((output) => (output.type === 'chunk' && output.isEntry ? [output] : []))
  return Object.fromEntries(
    sharedModules.map((name) => {
      const chunk = chunks.find((candidate) => candidate.facadeModuleId === facadeId(name))
      if (!chunk) throw new Error(`The build has no entry for the shared module ${name}`)
      return [name, `${base}${chunk.fileName}`]
    }),
  )
}

/**
 * Shares the modules plugins import with the admin app: an entry per shared module beside index.html in a build, its
 * facade module, and the import map in index.html, for `protobase build` and `protobase dev` alike.
 */
export const sharedModulesPlugin = (): Plugin => {
  let base = '/'
  return {
    name: 'protobase-shared-modules',
    config: (config, { command }) => {
      if (command !== 'build') return undefined
      const root = config.root ?? process.cwd()
      return {
        build: {
          rolldownOptions: {
            input: { index: path.join(root, 'index.html'), ...Object.fromEntries(sharedModules.map((name) => [entryName(name), facadeId(name)])) },
            // An entry keeps every export, which plugins import by name.
            preserveEntrySignatures: 'exports-only',
          },
        },
      }
    },
    configResolved: (config) => {
      base = config.base
    },
    resolveId: (id) => (id.startsWith(facadePrefix) ? id : undefined),
    load: (id) => {
      if (!id.startsWith(facadePrefix)) return undefined
      const name = id.slice(facadePrefix.length)
      return isSharedModule(name) ? facadeCode(name) : undefined
    },
    transformIndexHtml: {
      order: 'post',
      handler: (_html, context) => [importMapTag(moduleUrls(base, context))],
    },
  }
}
