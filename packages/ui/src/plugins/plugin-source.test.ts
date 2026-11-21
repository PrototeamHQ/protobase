import { describe, expect, it } from 'vitest'
import { pluginApi } from './plugin-api'
import type { PluginLoader } from './load-plugin'
import { createPluginSource, preloadPlugins } from './plugin-source'

const base = () => 'https://app.example.com/'
const hello = { url: 'https://cdn.example.com/hello/plugin.json' }
const slow = { url: 'https://cdn.example.com/slow/plugin.json' }
const loader = (stall: Promise<unknown>): PluginLoader => ({
  readJson: async (url) => {
    if (url === slow.url) await stall
    return { json: { name: url.split('/').at(-2), api: pluginApi, imports: {}, extensionPoints: [], entry: 'index.js' } }
  },
  addStylesheet: () => undefined,
  importModule: async () => ({}),
})

describe('plugins loaded before the first render', () => {
  it('are read at once once they have loaded, so the gate draws the app with them', async () => {
    const source = createPluginSource(loader(Promise.resolve()), base)
    expect(source.loaded(hello)).toBeUndefined()
    await preloadPlugins(source, [hello], 1000)
    expect(source.loaded(hello)).toMatchObject({ kind: 'loaded', plugin: { name: 'hello' } })
  })

  it('hold the start no longer than the wait, and a slow one is read once it comes', async () => {
    let release: (value: unknown) => void = () => {}
    const source = createPluginSource(loader(new Promise((resolve) => (release = resolve))), base)
    await preloadPlugins(source, [hello, slow], 20)
    expect(source.loaded(hello)?.kind).toBe('loaded')
    expect(source.loaded(slow)).toBeUndefined()
    release(undefined)
    await source.load(slow)
    expect(source.loaded(slow)?.kind).toBe('loaded')
  })
})

describe('plugins loaded again while the app runs', () => {
  it('forgets every load, so each plugin is fetched afresh, and tells whoever reads the source', async () => {
    let reads = 0
    const counting: PluginLoader = { ...loader(Promise.resolve()), readJson: async (url) => (reads++, { json: { name: url.split('/').at(-2), api: pluginApi, imports: {}, extensionPoints: [], entry: 'index.js' } }) }
    const source = createPluginSource(counting, base)
    await source.load(hello)
    await source.load(hello)
    expect(reads).toBe(1)
    const told: number[] = []
    const stop = source.subscribe(() => told.push(source.revision()))
    source.forget()
    expect(told).toEqual([1])
    expect(source.loaded(hello)).toBeUndefined()
    await source.load(hello)
    expect(reads).toBe(2)
    stop()
    source.forget()
    expect(told).toEqual([1])
  })
})
