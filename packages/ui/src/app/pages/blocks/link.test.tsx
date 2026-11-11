import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LayoutChild, LayoutNode } from '@protobase/layout'
import { RenderNode } from '../render-node'

const node = (type: string, props: LayoutNode['props'] = {}, children: LayoutChild[] = []): LayoutNode => ({ type, props, children })
const html = (element: LayoutNode) => renderToStaticMarkup(<RenderNode node={element} />)
const look = 'class="font-medium text-primary-text hover:underline"'

describe('LinkBlock', () => {
  it('shows its text', () => {
    expect(html(node('Link', { href: 'mailto:a@example.com' }, ['Mail']))).toBe(`<a href="mailto:a@example.com" ${look}>Mail</a>`)
  })

  it('shows where it leads without children', () => {
    expect(html(node('Link', { href: 'mailto:a@example.com' }))).toBe(`<a href="mailto:a@example.com" ${look}>mailto:a@example.com</a>`)
  })

  it('shows text and spans in order inside the link, in no paragraph', () => {
    const link = node('Link', { href: 'mailto:a@example.com' }, ['Mail ', node('Text', { as: 'span', className: 'font-semibold' }, ['Sam'])])
    expect(html(link)).toBe(`<a href="mailto:a@example.com" ${look}>Mail <span class="font-semibold">Sam</span></a>`)
  })

  it('runs inline in the one paragraph of a Text', () => {
    expect(html(node('Text', {}, ['Write to ', node('Link', { href: 'mailto:a@example.com' }, ['Sam'])]))).toBe(`<p>Write to <a href="mailto:a@example.com" ${look}>Sam</a></p>`)
  })
})
