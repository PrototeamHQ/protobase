import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { mergeUi } from './merge-ui'
import { defineUi, type BeforeSignInProps } from './project-ui'

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

  it('keeps the field types of every config, and refuses one two configs define', () => {
    const rating = { of: ['integer' as const], display: text('stars') }
    const slug = { of: ['text' as const], display: text('slug') }
    expect(mergeUi(defineUi({ extends: [defineUi({ fields: { rating } })], fields: { slug } })).fields).toEqual({ rating, slug })
    expect(mergeUi(defineUi({ components: {} }))).not.toHaveProperty('fields')
    expect(() => mergeUi(defineUi({ name: 'a', fields: { rating } }), defineUi({ name: 'b', fields: { rating: slug } }))).toThrow('The field type "rating" is defined twice, by a and by b; rename one of them')
  })

  it('keeps the drop rules of every config, and refuses one two configs define', () => {
    const first = () => undefined
    const last = () => 'Not here'
    expect(mergeUi(defineUi({ extends: [defineUi({ dropRules: { first } })], dropRules: { last } })).dropRules).toEqual({ first, last })
    expect(mergeUi(defineUi({ components: {} }))).not.toHaveProperty('dropRules')
    expect(() => mergeUi(defineUi({ name: 'a', dropRules: { first } }), defineUi({ name: 'b', dropRules: { first: last } }))).toThrow('The drop rule "first" is defined twice, by a and by b; rename one of them')
  })

  it('keeps every board drop, refusing a name defined twice', () => {
    const lanes = { doing: async () => undefined }
    const stages = { done: async () => undefined }
    expect(mergeUi(defineUi({ extends: [defineUi({ boardDrops: { lanes } })], boardDrops: { stages } })).boardDrops).toEqual({ lanes, stages })
    expect(mergeUi(defineUi({ components: {} }))).not.toHaveProperty('boardDrops')
    expect(() => mergeUi(defineUi({ name: 'a', boardDrops: { lanes } }), defineUi({ name: 'b', boardDrops: { lanes: stages } }))).toThrow('The board drop "lanes" is defined twice, by a and by b; rename one of them')
  })

  it('keeps every title rule, refusing a name defined twice', () => {
    const members = () => 'Sam'
    const topic = () => 'Launch'
    expect(mergeUi(defineUi({ extends: [defineUi({ titles: { members } })], titles: { topic } })).titles).toEqual({ members, topic })
    expect(mergeUi(defineUi({ components: {} }))).not.toHaveProperty('titles')
    expect(() => mergeUi(defineUi({ name: 'a', titles: { members } }), defineUi({ name: 'b', titles: { members: topic } }))).toThrow('The title rule "members" is defined twice, by a and by b; rename one of them')
  })

  it('extends a whole protobase.ui.tsx module, its components exported by name included', () => {
    const Board = text('board')
    const merged = mergeUi(defineUi({ name: 'app', extends: [{ Board, default: cloud }] }))
    expect(merged.components).toEqual({ ProtobaseCloudTask: TaskWidget, Board })
    expect(Object.keys(merged.actions!)).toEqual(['cloud-sync'])
  })

  it('draws every shell slot, the extended configs first', () => {
    const { shell } = mergeUi(defineUi({ extends: [cloud], shell: { actions: text('own action') } }))
    expect(renderToStaticMarkup(createElement(shell!.actions!))).toBe('<span>cloud action</span><span>own action</span>')
    expect(renderToStaticMarkup(createElement(shell!.rightPanel!))).toBe('<span>cloud panel</span>')
    expect(mergeUi(defineUi({ components: {} }))).not.toHaveProperty('shell')
  })

  it('draws one logo, the last config to set one', () => {
    const ownLogo = text('own logo')
    const cloudLogo = text('cloud logo')
    expect(mergeUi(defineUi({ extends: [{ shell: { logo: cloudLogo } }], shell: { logo: ownLogo } })).shell?.logo).toBe(ownLogo)
    expect(mergeUi(defineUi({ extends: [{ shell: { logo: cloudLogo } }] })).shell).toEqual({ logo: cloudLogo })
  })

  it('draws one bell, the last config to set one', () => {
    const ownBell = text('own bell')
    const pluginBell = text('plugin bell')
    expect(mergeUi(defineUi({ extends: [{ shell: { bell: pluginBell } }], shell: { bell: ownBell } })).shell?.bell).toBe(ownBell)
    expect(mergeUi(defineUi({ extends: [{ shell: { bell: pluginBell } }] })).shell).toEqual({ bell: pluginBell })
  })

  it('draws every beforeSignIn component around the pages, the extended configs outermost', () => {
    const around = (label: string) => ({ children }: BeforeSignInProps) => createElement('div', { title: label }, children)
    const { beforeSignIn } = mergeUi(defineUi({ extends: [defineUi({ beforeSignIn: around('cloud') })], beforeSignIn: around('own') }))
    const props = { signedIn: async () => false, params: new URLSearchParams(), removeParams: () => undefined, children: createElement('p', null, 'Sign in') }
    expect(renderToStaticMarkup(createElement(beforeSignIn!, props))).toBe('<div title="cloud"><div title="own"><p>Sign in</p></div></div>')
    expect(mergeUi(defineUi({ components: {} }))).not.toHaveProperty('beforeSignIn')
  })
})
