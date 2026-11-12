import { describe, expect, it } from 'vitest'
import { axProblems, fixedText, hiddenFocus, offScreen, outlineShows, outsideBar, ringWidth } from './ax-problems.mjs'

type Node = { nodeId: string; parentId?: string; childIds?: string[]; ignored?: boolean; role?: { value: string }; name?: { value: string }; properties?: Array<{ name: string; value: { value: unknown } }>; backendDOMNodeId?: number }

// A tree of a root with the given children, in order
const tree = (...children: Array<Omit<Node, 'nodeId' | 'parentId'>>): Node[] => [
  { nodeId: 'root', role: { value: 'RootWebArea' }, childIds: children.map((_, index) => `n${index}`) },
  ...children.map((child, index) => ({ ...child, nodeId: `n${index}`, parentId: 'root' })),
]
const heading = (level: number, text: string) => ({ role: { value: 'heading' }, name: { value: text }, properties: [{ name: 'level', value: { value: level } }] })
const main = { role: { value: 'main' } }

describe('axProblems', () => {
  it('finds nothing in a page with one main, named links and buttons and headings one level apart', () => {
    expect(axProblems(tree(heading(2, 'Work'), main, heading(1, 'Orders'), heading(2, 'Details'), { role: { value: 'link' }, name: { value: 'Order 7' } }))).toEqual([])
  })

  it('names a link or button without a name, but not one the tree ignores', () => {
    const nodes = tree({ role: { value: 'link' }, name: { value: ' ' }, backendDOMNodeId: 4 }, { role: { value: 'button' }, ignored: true }, main)
    expect(axProblems(nodes)).toEqual(['a link without a name (DOM node 4)'])
  })

  it('counts the main landmarks', () => {
    expect(axProblems(tree(main, main))).toEqual(['2 main landmarks, not 1'])
    expect(axProblems(tree())).toEqual(['0 main landmarks, not 1'])
  })

  it('finds a heading that skips a level, in reading order', () => {
    expect(axProblems(tree(main, heading(1, 'Order 7'), heading(3, 'Summary'), heading(2, 'Lines')))).toEqual(['heading "Summary" at level 3 follows level 1'])
  })
})

describe('fixedText', () => {
  it('finds the text that does not grow with the root size', () => {
    const before = [{ key: '1', text: 'Grows', size: 14 }, { key: '2', text: 'Stays', size: 11 }, { key: '3', text: 'Gone', size: 12 }]
    const after = [{ key: '1', text: 'Grows', size: 28.2 }, { key: '2', text: 'Stays', size: 11 }]
    expect(fixedText(before, after, 2)).toEqual(['"Stays" stays at 11px, not 22px'])
  })
})

describe('outlineShows', () => {
  it('shows an auto outline at any width and another style only above zero width', () => {
    expect(outlineShows('auto', 0)).toBe(true)
    expect(outlineShows('solid', 2)).toBe(true)
    expect(outlineShows('solid', 0)).toBe(false)
    expect(outlineShows('none', 2)).toBe(false)
  })
})

describe('hiddenFocus', () => {
  it('finds the links and buttons whose focus outline forced colors drop', () => {
    const focused = [{ text: 'Order 7', outline: 'solid', outlineWidth: 2 }, { text: 'Order 8', outline: 'none', outlineWidth: 2 }, { text: 'Order 9', outline: 'solid', outlineWidth: 0 }]
    expect(hiddenFocus(focused)).toEqual(['"Order 8" shows no outline when focused in forced colors (none 2px)', '"Order 9" shows no outline when focused in forced colors (solid 0px)'])
  })
})

describe('offScreen', () => {
  it('finds a page wider than the screen and the top bar controls that end past it', () => {
    expect(offScreen({ width: 360, page: 360, bar: [{ text: 'Search', right: 360 }] })).toEqual([])
    expect(offScreen({ width: 360, page: 420, bar: [{ text: 'Search', right: 300 }, { text: 'Record actions', right: 420 }] })).toEqual([
      'the page is 420px wide, wider than 360px',
      'the top bar\'s "Record actions" ends at 420px, past 360px',
    ])
  })
})

describe('ringWidth', () => {
  it('takes the largest spread of the shadows, and none without a shadow', () => {
    expect(ringWidth('rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(37 99 235 / 0.2) 0px 0px 0px 2px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px')).toBe(2)
    expect(ringWidth('none')).toBe(0)
  })
})

describe('outsideBar', () => {
  const bar = { top: 0, bottom: 50 }
  it('finds a control or focus ring that runs past the bar', () => {
    expect(outsideBar({ bar, controls: [{ text: 'Search field', top: 3, bottom: 47, boxShadow: 'rgb(0 0 0) 0px 0px 0px 2px' }, { text: 'Close search', top: 0, bottom: 50, boxShadow: 'none' }] })).toEqual([])
    expect(outsideBar({ bar, controls: [{ text: 'Search field', top: 1, bottom: 48, boxShadow: 'rgb(0 0 0) 0px 0px 0px 2px' }, { text: 'Close search', top: 2, bottom: 51, boxShadow: 'none' }] })).toEqual([
      'the top bar\'s "Search field" runs from -1px to 50px, outside the bar\'s 0px to 50px',
      'the top bar\'s "Close search" runs from 2px to 51px, outside the bar\'s 0px to 50px',
    ])
  })
})
