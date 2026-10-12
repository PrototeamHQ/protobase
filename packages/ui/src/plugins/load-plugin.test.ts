import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FieldModel } from '@protobase/schema'
import { definePlugin } from '../app/pages/project-ui'
import { loadPlugin, type PluginLoader } from './load-plugin'
import { usePlugin } from './plugin-context'

const host = { api: 1, version: '0.12.4' }
const base = 'https://app.example.com/orders'
const manifest = { name: 'hello', version: '1.2.0', api: 1, protobase: '>=0.12.0', entry: 'assets/index-abc.js', css: 'assets/index-def.css' }

const Greeting = () => {
  const plugin = usePlugin()
  return createElement('p', null, `${plugin.name} ${plugin.version} ${String(plugin.settings.greeting)} ${plugin.url}`)
}

// A loader over in-memory files: plugin.json answers by URL, modules by URL, and it notes the stylesheets added.
const memoryLoader = (files: Record<string, unknown>, modules: Record<string, Record<string, unknown>> = {}) => {
  const stylesheets: string[] = []
  const imported: string[] = []
  const loader: PluginLoader = {
    readJson: async (url) => (url in files ? { json: files[url] } : { status: 404 }),
    addStylesheet: (url) => void stylesheets.push(url),
    importModule: async (url) => {
      imported.push(url)
      const module = modules[url]
      if (!module) throw new SyntaxError("The requested module '@protobase/ui' does not provide an export named 'notInThisRelease'")
      return module
    },
  }
  return { loader, stylesheets, imported }
}

describe('loadPlugin', () => {
  it('reads plugin.json, adds its stylesheet and imports its module, both beside it, and draws its components inside it', async () => {
    const { loader, stylesheets, imported } = memoryLoader(
      { 'https://cdn.example.com/hello/plugin.json': manifest },
      { 'https://cdn.example.com/hello/assets/index-abc.js': { Greeting, default: definePlugin({ actions: { wave: () => undefined } }) } },
    )
    const load = await loadPlugin({ url: 'https://cdn.example.com/hello/plugin.json', settings: { greeting: 'hi' } }, loader, base, host)
    expect(stylesheets).toEqual(['https://cdn.example.com/hello/assets/index-def.css'])
    expect(imported).toEqual(['https://cdn.example.com/hello/assets/index-abc.js'])
    if (load.kind !== 'loaded') throw new Error(load.reason)
    expect(load.plugin).toEqual({ name: 'hello', version: '1.2.0', url: 'https://cdn.example.com/hello/plugin.json', settings: { greeting: 'hi' } })
    expect(Object.keys(load.ui.actions!)).toEqual(['wave'])
    expect(renderToStaticMarkup(createElement(load.ui.components!.Greeting!))).toBe('<p>hello 1.2.0 hi https://cdn.example.com/hello/plugin.json</p>')
  })

  it('draws the parts of its field types inside it too, keeping the storage types each shows', async () => {
    const Stars = ({ value }: { value: number | null }) => createElement('p', null, `${usePlugin().name}: ${value} stars`)
    const { loader } = memoryLoader(
      { 'https://cdn.example.com/hello/plugin.json': manifest },
      { 'https://cdn.example.com/hello/assets/index-abc.js': { default: definePlugin({ fields: { rating: { of: ['integer'], display: Stars } } }) } },
    )
    const load = await loadPlugin({ url: 'https://cdn.example.com/hello/plugin.json' }, loader, base, host)
    if (load.kind !== 'loaded') throw new Error(load.reason)
    const rating = load.ui.fields!.rating!
    expect(rating.of).toEqual(['integer'])
    expect(rating).not.toHaveProperty('editor')
    expect(renderToStaticMarkup(createElement(rating.display, { value: 4, props: {}, field: { name: 'score', type: 'integer' } as FieldModel }))).toBe('<p>hello: 4 stars</p>')
  })

  it('finds a plugin.json named by a path on the app\'s own origin', async () => {
    const { loader, imported } = memoryLoader({ 'https://app.example.com/plugins/hello/plugin.json': manifest }, { 'https://app.example.com/plugins/hello/assets/index-abc.js': {} })
    expect((await loadPlugin({ url: '/plugins/hello/plugin.json' }, loader, base, host)).kind).toBe('loaded')
    expect(imported).toEqual(['https://app.example.com/plugins/hello/assets/index-abc.js'])
  })

  it('turns off a plugin whose plugin.json is missing or wrong, importing nothing', async () => {
    const { loader, imported } = memoryLoader({ 'https://cdn.example.com/bad/plugin.json': { ...manifest, entry: '' } })
    expect(await loadPlugin({ url: 'https://cdn.example.com/none/plugin.json' }, loader, base, host)).toEqual({ kind: 'off', url: 'https://cdn.example.com/none/plugin.json', reason: 'its plugin.json answered 404' })
    expect(await loadPlugin({ url: 'https://cdn.example.com/bad/plugin.json' }, loader, base, host)).toEqual({ kind: 'off', url: 'https://cdn.example.com/bad/plugin.json', reason: 'its plugin.json names no module' })
    expect(imported).toEqual([])
  })

  it('turns off a plugin built for another plugin API or Protobase version, importing nothing', async () => {
    const { loader, imported, stylesheets } = memoryLoader({
      'https://cdn.example.com/next/plugin.json': { ...manifest, name: 'next', api: 2 },
      'https://cdn.example.com/newer/plugin.json': { ...manifest, name: 'newer', protobase: '>=0.13.0' },
    })
    expect(await loadPlugin({ url: 'https://cdn.example.com/next/plugin.json' }, loader, base, host)).toEqual({ kind: 'off', url: 'https://cdn.example.com/next/plugin.json', name: 'next', reason: 'it is built for plugin API 2, and this app has plugin API 1' })
    expect(await loadPlugin({ url: 'https://cdn.example.com/newer/plugin.json' }, loader, base, host)).toEqual({ kind: 'off', url: 'https://cdn.example.com/newer/plugin.json', name: 'newer', reason: 'it needs Protobase >=0.13.0, and this app runs 0.12.4' })
    expect([...imported, ...stylesheets]).toEqual([])
  })

  it('turns off a plugin whose module does not load or link, or whose own configs clash, naming it', async () => {
    const clashing = definePlugin({ extends: [definePlugin({ name: 'inner', components: { Greeting: () => null } })], components: { Greeting } })
    const { loader } = memoryLoader(
      { 'https://cdn.example.com/hello/plugin.json': manifest, 'https://cdn.example.com/clash/plugin.json': { ...manifest, name: 'clash', entry: 'clash.js' } },
      { 'https://cdn.example.com/clash/clash.js': { default: clashing } },
    )
    expect(await loadPlugin({ url: 'https://cdn.example.com/hello/plugin.json' }, loader, base, host)).toEqual({
      kind: 'off',
      url: 'https://cdn.example.com/hello/plugin.json',
      name: 'hello',
      reason: "it could not be loaded: The requested module '@protobase/ui' does not provide an export named 'notInThisRelease'",
    })
    expect(await loadPlugin({ url: 'https://cdn.example.com/clash/plugin.json' }, loader, base, host)).toMatchObject({ kind: 'off', name: 'clash', reason: 'it could not be loaded: The component "Greeting" is defined twice, by inner and by clash; rename one of them' })
  })

  it('turns off a plugin whose plugin.json cannot be read at all', async () => {
    const loader: PluginLoader = { ...memoryLoader({}).loader, readJson: () => Promise.reject(new TypeError('Failed to fetch')) }
    expect(await loadPlugin({ url: 'https://cdn.example.com/hello/plugin.json' }, loader, base, host)).toEqual({ kind: 'off', url: 'https://cdn.example.com/hello/plugin.json', reason: 'it could not be loaded: Failed to fetch' })
  })
})
