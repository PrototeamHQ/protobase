import { describe, expect, it } from 'vitest'
import type { LayoutItemModel } from '@protobase/schema'
import { shownLayout } from './shown-layout'

const items: LayoutItemModel[] = [
  { kind: 'section', title: 'Always', fields: ['a'] },
  { kind: 'section', title: 'Editing', fields: ['b'], when: 'editing' },
  { kind: 'section', title: 'Done', fields: ['c'], when: 'status = "done"' },
  { kind: 'sidebar', fields: ['d'], when: 'status = "open"' },
]
const titles = (shown: LayoutItemModel[]) => shown.map((item) => (item.kind === 'section' ? item.title : item.kind))

describe('shownLayout', () => {
  it('shows the items whose condition holds and those the mode allows', () => {
    expect(titles(shownLayout(items, [true, false], false, false))).toEqual(['Always', 'Done'])
    expect(titles(shownLayout(items, [false, true], true, false))).toEqual(['Always', 'Editing', 'sidebar'])
  })

  it('hides conditional items while their values load, and on a preview', () => {
    expect(titles(shownLayout(items, [undefined, undefined], false, false))).toEqual(['Always'])
    expect(titles(shownLayout(items, [], false, true))).toEqual(['Always'])
  })
})
