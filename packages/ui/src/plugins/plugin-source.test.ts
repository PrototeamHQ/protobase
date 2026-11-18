import { describe, expect, it } from 'vitest'
import { pluginApi, protobaseVersion } from './plugin-api'
import type { PluginLoader } from './load-plugin'
import { createPluginSource, preloadPlugins } from './plugin-source'

const base = () => 'https://app.example.com/'
const hello = { url: 'https://cdn.example.com/hello/plugin.json' }
const slow = { url: 'https://cdn.example.com/slow/plugin.json' }
const loader = (stall: Promise<unknown>): PluginLoader => ({
  readJson: async (url) => {
    if (url === slow.url) await stall
    return { json: { name: url.split('/').at(-2), api: pluginApi, protobase: `>=${protobaseVersion}`, entry: 'index.js' } }
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
