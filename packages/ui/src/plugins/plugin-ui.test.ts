import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { BoardDrop } from '../app/displays/board-drop'
import type { DropRule } from '../app/hand-order/drop-rule'
import { mergePlugins } from './merge-plugins'
import { pluginUi } from './plugin-ui'

const plugin = { name: 'app', url: 'https://cdn.example.com/app/plugin.json', settings: {} }

describe('pluginUi', () => {
  it('keeps the drop rules, board drops and shell logo of the module', () => {
    const drop: BoardDrop = { done: async () => undefined }
    const rule: DropRule = () => undefined
    const Logo = () => createElement('span', null, 'logo')
    const ui = pluginUi(plugin, { default: { boardDrops: { park: drop }, dropRules: { r: rule }, shell: { logo: Logo } } })
    expect(ui.boardDrops).toEqual({ park: drop })
    expect(ui.dropRules).toEqual({ r: rule })
    expect(ui.shell?.logo?.displayName).toBe('app:shell.logo')
    const merged = mergePlugins(undefined, [{ kind: 'loaded', plugin, ui }])
    expect(merged.ui.boardDrops?.park).toBe(drop)
    expect(merged.ui.dropRules?.r).toBe(rule)
  })
})
