import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LayoutChild, LayoutNode } from '@protobase/layout'
import { RenderNode } from './render-node'

const node = (type: string, props: LayoutNode['props'] = {}, children: LayoutChild[] = []): LayoutNode => ({ type, props, children })
const html = (element: LayoutNode) => renderToStaticMarkup(<RenderNode node={element} />)

describe('Tailwind classes in a layout', () => {
  it('draw the plain elements with their classes, and only the layout their name says', () => {
    expect(html(node('Box', { className: 'rounded-xl p-6' }, ['Hi']))).toBe('<div class="rounded-xl p-6"><p class="leading-6">Hi</p></div>')
    expect(html(node('Row', { className: 'gap-3' }))).toBe('<div class="flex gap-3"></div>')
    expect(html(node('Column', { className: 'gap-6' }))).toBe('<div class="flex flex-col gap-6"></div>')
    expect(html(node('Box'))).toBe('<div></div>')
  })

  it('draw a Text as its tag with its text and links inline, in no paragraph of their own', () => {
    const text = node('Text', { as: 'h1', className: 'text-4xl' }, ['Read the ', node('Link', { href: 'https://example.com', className: 'underline' }, ['guide'])])
    expect(html(text)).toBe('<h1 class="text-4xl">Read the <a href="https://example.com" class="underline" target="_blank" rel="noreferrer">guide</a></h1>')
    expect(html(node('Text', {}, ['Plain']))).toBe('<p>Plain</p>')
  })

  it('draw a Text span inside a Text inline', () => {
    expect(html(node('Text', {}, ['Hi ', node('Text', { as: 'span', className: 'font-semibold' }, ['Sam'])]))).toBe('<p>Hi <span class="font-semibold">Sam</span></p>')
  })

  it("add to a button-looking link's button classes", () => {
    expect(html(node('Link', { href: 'https://example.com', variant: 'primary', className: 'w-full' }, ['Go']))).toMatch(/^<a href="https:\/\/example.com" class="[^"]+ w-full" target="_blank" rel="noreferrer">Go<\/a>$/)
  })

  it("replace a link's own look, which it keeps without them", () => {
    expect(html(node('Link', { href: 'mailto:a@example.com' }, ['Mail']))).toBe('<a href="mailto:a@example.com" class="font-medium text-primary-text hover:underline">Mail</a>')
  })

  it("put a fixed image's classes on the image, which without them never grows wider than its space", () => {
    expect(html(node('Image', { src: '/logo.svg', alt: 'Logo', className: 'size-16 rounded-full' }))).toContain('<img src="/logo.svg" alt="Logo" class="size-16 rounded-full"/>')
    expect(html(node('Image', { src: '/logo.svg', width: 64 }))).toContain('<img src="/logo.svg" alt="" width="64" class="max-w-full"/>')
  })

  it("add to a block's outer element", () => {
    expect(html(node('Card', { title: 'Plan', className: 'ring-2 ring-primary' }))).toMatch(/^<section class="flex min-w-0 flex-col rounded-lg border border-border bg-background h-full ring-2 ring-primary" aria-label="Plan">/)
    expect(html(node('Grid', { className: 'mt-8' }))).toBe('<div class="grid grid-cols-1 gap-4 md:grid-cols-2 mt-8"></div>')
  })
})
