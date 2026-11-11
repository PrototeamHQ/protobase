import { describe, expect, it } from 'vitest'
import type { LayoutNode, PageModel } from '@protobase/layout'
import { pagesCarryClasses } from './page-classes'

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
