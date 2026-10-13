import type { PluginRef } from '@protobase/client'
import { pluginProblem, type PluginHost } from '@protobase/schema/internal'
import type { ProjectUi } from '../app/pages/project-ui'
import type { PluginInfo } from './plugin-context'
import { parseManifest } from './plugin-manifest'
import { pluginUi } from './plugin-ui'
import { pluginApi, protobaseVersion } from './plugin-api'

/** A plugin the app loaded, with its UI config, or one it did not load and why. */
export type PluginLoad = { kind: 'loaded'; plugin: PluginInfo; ui: ProjectUi } | { kind: 'off'; url: string; name?: string; reason: string }

/** What loading a plugin needs from the page: reading its plugin.json, adding its stylesheet and importing its module. */
export type PluginLoader = {
  /** The JSON at `url`, or the HTTP status it answered with. */
  readJson: (url: string) => Promise<{ json: unknown } | { status: number }>
  addStylesheet: (url: string) => void
  importModule: (url: string) => Promise<Record<string, unknown>>
}

/** The page's own: `fetch` without a cached copy, a `<link>` per stylesheet, and `import()`. */
export const browserLoader: PluginLoader = {
  readJson: async (url) => {
    const response = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' })
    return response.ok ? { json: await response.json() } : { status: response.status }
  },
  addStylesheet: (url) => {
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((link) => (link as HTMLLinkElement).href === url)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    document.head.append(link)
  },
  importModule: (url) => import(/* @vite-ignore */ url),
}

/** This app, as a plugin's plugin.json is checked against. */
const thisApp: PluginHost = { api: pluginApi, version: protobaseVersion }

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Loads the plugin `ref` names: its plugin.json, then, when this app may load it (see `pluginProblem`), its stylesheet
 * and module. Every way a plugin can fail ends in `off` with the reason, never in a broken app.
 */
export const loadPlugin = async (ref: PluginRef, loader: PluginLoader, base: string, host = thisApp): Promise<PluginLoad> => {
  const url = new URL(ref.url, base).href
  const off = (reason: string, name?: string): PluginLoad => ({ kind: 'off', url, ...(name && { name }), reason })
  let name: string | undefined
  try {
    const read = await loader.readJson(url)
    if ('status' in read) return off(`its plugin.json answered ${read.status}`)
    const parsed = parseManifest(read.json)
    if ('problem' in parsed) return off(parsed.problem)
    const { manifest } = parsed
    name = manifest.name
    const problem = pluginProblem(manifest, host)
    if (problem) return off(problem, name)
    if (manifest.css) loader.addStylesheet(new URL(manifest.css, url).href)
    const module = await loader.importModule(new URL(manifest.entry, url).href)
    const plugin: PluginInfo = { name, ...(manifest.version && { version: manifest.version }), url, settings: ref.settings ?? {} }
    return { kind: 'loaded', plugin, ui: pluginUi(plugin, module) }
  } catch (error) {
    // The loader is the one place a plugin's failures end, from an unreachable file to a module that does not link
    // against this app's @protobase/ui: each turns that plugin off and tells the app's admins why.
    return off(`it could not be loaded: ${describe(error)}`, name)
  }
}
