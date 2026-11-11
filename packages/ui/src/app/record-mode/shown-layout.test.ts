import { describe, expect, it } from 'vitest'
import type { LayoutItemModel } from '@protobase/schema'
import { conditionalItems, fallbackEntries, shownLayout, whenOf } from './shown-layout'

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

  it('filters the items inside a group, and drops a group that is hidden or left empty', () => {
    const grouped: LayoutItemModel[] = [
      {
        kind: 'group',
        title: 'More',
        collapsed: true,
        when: 'status = "open"',
        items: [
          { kind: 'section', title: 'Editing', fields: ['b'], when: 'editing' },
          { kind: 'section', title: 'Done', fields: ['c'], when: 'status = "done"' },
        ],
      },
    ]
    expect(conditionalItems(grouped).map(whenOf)).toEqual(['status = "open"', 'status = "done"'])
    const inner = (shown: LayoutItemModel[]) => shown.flatMap((item) => (item.kind === 'group' ? item.items.map((entry) => (entry as { title: string }).title) : []))
    expect(inner(shownLayout(grouped, [true, true], false, false))).toEqual(['Done'])
    expect(shownLayout(grouped, [false, true], false, false)).toEqual([])
    expect(shownLayout(grouped, [true, false], false, false)).toEqual([])
  })

  it('drops a tab whose items all hide, and reads the conditions inside a group inside a tab', () => {
    const tabbed: LayoutItemModel[] = [
      { kind: 'tab', title: 'Form', items: [{ kind: 'section', title: 'Editing', fields: ['b'], when: 'editing' }] },
      {
        kind: 'tab',
        title: 'More',
        items: [{ kind: 'group', title: 'Deep', when: 'always', items: [{ kind: 'section', title: 'Done', fields: ['c'], when: 'status = "done"' }] }],
      },
    ]
    expect(conditionalItems(tabbed).map((item) => (item as { title: string }).title)).toEqual(['Done'])
    expect(shownLayout(tabbed, [false], false, false)).toEqual([])
    expect(shownLayout(tabbed, [true], false, false).map((item) => (item as { title: string }).title)).toEqual(['More'])
    expect(shownLayout(tabbed, [], true, false).map((item) => (item as { title: string }).title)).toEqual(['Form'])
  })

  it('applies each condition inside a custom section fallback, nested and sidebar custom sections included, and keeps an all-hidden fallback as []', () => {
    const done: LayoutItemModel = { kind: 'section', title: 'Done', fields: ['c'], when: 'status = "done"' }
    const always: LayoutItemModel = { kind: 'section', title: 'Always', fields: ['a'] }
    const inner: LayoutItemModel = { kind: 'custom', component: 'Inner', when: 'editing', fallback: [done] }
    const side: LayoutItemModel = { kind: 'custom', component: 'Side', sidebar: true, when: 'reading' }
    const main: LayoutItemModel = { kind: 'custom', component: 'Chat', fallback: [inner, always] }
    const sidebar: LayoutItemModel = { kind: 'custom', component: 'Card', sidebar: true, fallback: [side] }
    expect(conditionalItems([main, sidebar])).toEqual([done])
    expect(shownLayout([main, sidebar], [true], false, false)).toEqual([{ ...main, fallback: [always], fallbackAt: [1] }, { ...sidebar, fallbackAt: [0] }])
    expect(shownLayout([main, sidebar], [true], true, false)).toEqual([
      { ...main, fallback: [{ ...inner, fallbackAt: [0] }, always], fallbackAt: [0, 1] },
      { ...sidebar, fallback: [], fallbackAt: [] },
    ])
    expect(shownLayout([main, sidebar], [false], true, false)).toEqual([
      { ...main, fallback: [{ ...inner, fallback: [], fallbackAt: [] }, always], fallbackAt: [0, 1] },
      { ...sidebar, fallback: [], fallbackAt: [] },
    ])
  })

  it('keeps a fallback item at its place in the whole fallback while an item before it hides and shows', () => {
    const composer: LayoutItemModel = { kind: 'composer', resource: 'messages', field: 'task_id', text: 'body' }
    const chat: LayoutItemModel = { kind: 'custom', component: 'Chat', fallback: [{ kind: 'section', title: 'Editing', fields: ['b'], when: 'editing' }, composer] }
    const places = (editing: boolean) => fallbackEntries(shownLayout([chat], [], editing, false)[0] as typeof chat).map(([entry, at]) => [entry.kind, at])
    expect(places(true)).toEqual([['section', 0], ['composer', 1]])
    expect(places(false)).toEqual([['composer', 1]])
  })
})
