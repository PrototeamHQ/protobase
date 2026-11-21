import { describe, expect, it } from 'vitest'
import { definePlugin } from '../app/pages/project-ui'
import { extensionPointsOf, pluginExtensionPoints } from './extension-points'
import { pluginUi } from './plugin-ui'

const Part = () => null
const every = definePlugin({
  components: { Part },
  actions: { wave: () => undefined },
  fields: { rating: { of: ['integer'], display: Part } },
  fileViewers: { 'text/x-note': { component: Part } },
  dropRules: { anywhere: () => true },
  boardDrops: { columns: () => ({}) },
  titles: { plain: () => 'title' },
  marks: { none: () => ({}) },
  shell: { actions: Part, rightPanel: Part, logo: Part, bell: Part },
  beforeSignIn: Part,
} as never)

describe('extensionPointsOf', () => {
  it('names the extension points a config fills, leaving out empty maps and what plugins cannot fill', () => {
    expect(extensionPointsOf(definePlugin({ components: { Part }, actions: {}, shell: { bell: Part }, presence: () => ({}) } as never))).toEqual(['components', 'shell.bell'])
    expect(extensionPointsOf({})).toEqual([])
  })

  it('names every extension point the app reads from a plugin', () => {
    expect(extensionPointsOf(every)).toEqual([...pluginExtensionPoints])
    expect(extensionPointsOf(pluginUi({ name: 'all', url: 'https://cdn.example.com/all/plugin.json', settings: {} }, { default: every }))).toEqual([...pluginExtensionPoints])
  })
})
