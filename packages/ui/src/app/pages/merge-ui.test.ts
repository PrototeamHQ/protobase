import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { mergeUi } from './merge-ui'
import { defineUi } from './project-ui'

const text = (value: string) => () => createElement('span', null, value)
const TaskWidget = text('task')
const cloud = defineUi({ name: 'protobase-cloud', components: { ProtobaseCloudTask: TaskWidget }, actions: { 'cloud-sync': () => undefined }, shell: { actions: text('cloud action'), rightPanel: text('cloud panel') } })

describe('mergeUi', () => {
  it('keeps the components and action handlers of every config', () => {
    const UsageChart = text('usage')
    const archive = () => undefined
    const merged = mergeUi(defineUi({ name: 'app', extends: [cloud], components: { UsageChart }, actions: { archive } }))
    expect(merged.components).toEqual({ ProtobaseCloudTask: TaskWidget, UsageChart })
    expect(Object.keys(merged.actions!)).toEqual(['cloud-sync', 'archive'])
    expect(merged).not.toHaveProperty('extends')
  })

  it('refuses a component or an action handler two configs define, naming both', () => {
    expect(() => mergeUi(cloud, defineUi({ name: 'app', components: { ProtobaseCloudTask: text('mine') } }))).toThrow('The component "ProtobaseCloudTask" is defined twice, by protobase-cloud and by app; rename one of them')
    expect(() => mergeUi(defineUi({ name: 'app', extends: [cloud], actions: { 'cloud-sync': () => undefined } }))).toThrow('The action handler "cloud-sync" is defined twice, by protobase-cloud and by app')
    expect(() => mergeUi(defineUi({ extends: [defineUi({ components: { A: text('a') } })], components: { A: text('b') } }))).toThrow('The component "A" is defined twice, by UI config 1 extends[0] and by UI config 1')
  })

  it('draws every shell slot, the extended configs first', () => {
    const { shell } = mergeUi(defineUi({ extends: [cloud], shell: { actions: text('own action') } }))
    expect(renderToStaticMarkup(createElement(shell!.actions!))).toBe('<span>cloud action</span><span>own action</span>')
    expect(renderToStaticMarkup(createElement(shell!.rightPanel!))).toBe('<span>cloud panel</span>')
    expect(mergeUi(defineUi({ components: {} }))).not.toHaveProperty('shell')
  })
})
