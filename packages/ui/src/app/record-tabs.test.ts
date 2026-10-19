import { describe, expect, it } from 'vitest'
import type { LayoutItemModel, TabModel } from '@protobase/schema'
import { attentionTab, shownTab, splitTabs } from './record-tabs'

const section = (title: string, fields: string[]): LayoutItemModel => ({ kind: 'section', title, fields })
const tab = (title: string, items: TabModel['items']): TabModel => ({ kind: 'tab', title, items })
const one = tab('One', [{ kind: 'section', title: 'A', fields: ['a'] }])
const two = tab('Two', [{ kind: 'group', title: 'G', items: [{ kind: 'section', title: 'B', fields: ['b'] }] }])

describe('splitTabs', () => {
  it('has no tabs for a layout without them', () => {
    const layout = [section('A', ['a'])]
    expect(splitTabs(layout)).toEqual({ before: layout, tabs: [], after: [] })
  })

  it('puts the items before and after the run of tabs apart', () => {
    const before = section('Before', [])
    const after = section('After', [])
    expect(splitTabs([before, one, two, after])).toEqual({ before: [before], tabs: [one, two], after: [after] })
  })
})

describe('shownTab', () => {
  it('is the named tab, else the first', () => {
    expect(shownTab([one, two], 'Two')).toBe(two)
    expect(shownTab([one, two], 'Gone')).toBe(one)
    expect(shownTab([one, two], undefined)).toBe(one)
    expect(shownTab([], 'Two')).toBeUndefined()
  })
})

describe('attentionTab', () => {
  it('stays when the shown tab has the field, moves to the one that has it, and counts fields inside groups', () => {
    expect(attentionTab([one, two], one, (name) => name === 'a')).toBeUndefined()
    expect(attentionTab([one, two], one, (name) => name === 'b')).toBe(two)
    expect(attentionTab([one, two], two, (name) => name === 'a' || name === 'b')).toBeUndefined()
    expect(attentionTab([one, two], one, () => false)).toBeUndefined()
  })
})
