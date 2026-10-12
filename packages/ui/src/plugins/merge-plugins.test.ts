import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { defineUi } from '../app/pages/project-ui'
import type { PluginLoad } from './load-plugin'
import { mergePlugins } from './merge-plugins'

const text = (value: string) => () => createElement('span', null, value)
const loaded = (name: string, ui: Parameters<typeof defineUi>[0]): PluginLoad => ({ kind: 'loaded', plugin: { name, url: `https://cdn.example.com/${name}/plugin.json`, settings: {} }, ui: { ...ui, name } })

describe('mergePlugins', () => {
  it('merges the loaded plugins before the app\'s own UI, and passes on the ones that are off', () => {
    const Own = text('own')
    const Board = text('board')
    const off: PluginLoad = { kind: 'off', url: 'https://cdn.example.com/old/plugin.json', name: 'old', reason: 'it is built for plugin API 2, and this app has plugin API 1' }
    const merged = mergePlugins(defineUi({ name: 'protobase.ui.tsx', components: { Own } }), [loaded('board', { components: { Board } }), off])
    expect(merged.ui.components).toEqual({ Board, Own })
    expect(merged.off).toEqual([off])
  })

  it('turns off a plugin that defines what the app or an earlier plugin defines, which keeps it', () => {
    const Own = text('own')
    const merged = mergePlugins(defineUi({ name: 'protobase.ui.tsx', components: { Own } }), [
      loaded('first', { actions: { sync: () => undefined } }),
      loaded('second', { actions: { sync: () => undefined } }),
      loaded('third', { components: { Own: text('theirs') } }),
    ])
    expect(merged.ui.components).toEqual({ Own })
    expect(Object.keys(merged.ui.actions!)).toEqual(['sync'])
    expect(merged.off.map(({ name, reason }) => ({ name, reason }))).toEqual([
      { name: 'second', reason: 'The action handler "sync" is defined twice, by first and by second; rename one of them' },
      { name: 'third', reason: 'The component "Own" is defined twice, by third and by protobase.ui.tsx; rename one of them' },
    ])
  })

  it('throws on a conflict within the app\'s own UI configs, as without plugins', () => {
    const project = defineUi({ name: 'app', extends: [defineUi({ name: 'base', components: { A: text('a') } })], components: { A: text('b') } })
    expect(() => mergePlugins(project, [])).toThrow('The component "A" is defined twice, by base and by app')
  })
})
