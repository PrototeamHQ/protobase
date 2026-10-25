import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { BoardDrop } from '../app/displays/board-drop'
import type { DropRule } from '../app/hand-order/drop-rule'
import { mergePlugins } from './merge-plugins'
import { pluginUi } from './plugin-ui'

const plugin = { name: 'app', url: 'https://cdn.example.com/app/plugin.json', settings: {} }

describe('pluginUi', () => {
  it('keeps the drop rules, board drops, shell logo and bell of the module', () => {
    const drop: BoardDrop = { done: async () => undefined }
    const rule: DropRule = () => undefined
    const Logo = () => createElement('span', null, 'logo')
    const Bell = () => createElement('span', null, 'bell')
    const ui = pluginUi(plugin, { default: { boardDrops: { park: drop }, dropRules: { r: rule }, shell: { logo: Logo, bell: Bell } } })
    expect(ui.boardDrops).toEqual({ park: drop })
    expect(ui.dropRules).toEqual({ r: rule })
    expect(ui.shell?.logo?.displayName).toBe('app:shell.logo')
    expect(ui.shell?.bell?.displayName).toBe('app:shell.bell')
    const merged = mergePlugins(undefined, [{ kind: 'loaded', plugin, ui }])
    expect(merged.ui.boardDrops?.park).toBe(drop)
    expect(merged.ui.dropRules?.r).toBe(rule)
  })
})
