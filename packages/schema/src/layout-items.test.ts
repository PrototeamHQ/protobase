import { describe, expect, it } from 'vitest'
import { layoutItems } from './layout-items'
import type { LayoutItemModel } from './model'

const section = (title: string): LayoutItemModel => ({ kind: 'section', title, fields: [] })
const related = (title: string): LayoutItemModel => ({ kind: 'related', title, resource: 'parts', field: 'repair_id' })

describe('layoutItems', () => {
  it('puts a group’s items in its place', () => {
    const group: LayoutItemModel = { kind: 'group', title: 'More', items: [section('B') as never, related('C') as never] }
    expect(layoutItems([section('A'), group, section('D')]).map((item) => (item as { title: string }).title)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('looks inside tabs and the groups in them', () => {
    const group: LayoutItemModel = { kind: 'group', title: 'More', items: [related('C') as never] }
    const tab: LayoutItemModel = { kind: 'tab', title: 'T', items: [section('B') as never, group as never] }
    expect(layoutItems([section('A'), tab, section('D')]).map((item) => (item as { title: string }).title)).toEqual(['A', 'B', 'C', 'D'])
  })
})
