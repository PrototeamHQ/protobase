import { describe, expect, it } from 'vitest'
import type { LayoutNode, PageModel } from '@protobase/layout'
import type { ViewModel } from '@protobase/schema'
import { pagesCarryClasses, viewsCarryClasses } from './page-classes'

const pageOf = (tree: LayoutNode): PageModel => ({ name: 'home', title: 'Home', tree }) as PageModel
const node = (type: string, props: LayoutNode['props'] = {}, children: LayoutNode['children'] = []): LayoutNode => ({ type, props, children })

describe('pagesCarryClasses', () => {
  it('finds classes on an element deep in a page', () => {
    expect(pagesCarryClasses([pageOf(node('Page', { title: 'Home' }, [node('Row', {}, [node('Box', { className: 'rounded-xl p-6' })])]))])).toBe(true)
  })

  it('finds classes on an element in a prop', () => {
    expect(pagesCarryClasses([pageOf(node('Page', { title: 'Home', actions: node('Link', { href: '/x', className: 'underline' }) }))])).toBe(true)
  })

  it('finds none in pages without classes, or with only blank ones', () => {
    expect(pagesCarryClasses([pageOf(node('Page', { title: 'Home' }, [node('Box', { className: ' ' })]))])).toBe(false)
    expect(pagesCarryClasses([])).toBe(false)
  })
})

describe('viewsCarryClasses', () => {
  const viewOf = (layout: unknown[]) => ({ resource: 'tasks', layout }) as unknown as ViewModel

  it("finds classes in a record page's block tree, inside a tab too", () => {
    expect(viewsCarryClasses([viewOf([{ kind: 'tab', title: 'Log', items: [{ kind: 'blocks', tree: node('Box', { className: 'p-4' }) }] }])])).toBe(true)
    expect(viewsCarryClasses([viewOf([{ kind: 'blocks', tree: node('Box') }, { kind: 'section', title: 'Task', fields: [] }])])).toBe(false)
  })
})
