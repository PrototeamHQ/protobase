import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SelectInput, type LayoutChild, type LayoutNode } from '@protobase/layout'
import { Router } from '../../router'
import { PageParamsProvider } from '../page-params'
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

  it('shows where it leads when its children are only blank text', () => {
    expect(html(node('Link', { href: 'mailto:a@example.com' }, ['']))).toBe(`<a href="mailto:a@example.com" ${look}>mailto:a@example.com</a>`)
    expect(html(node('Link', { href: 'mailto:a@example.com' }, ['  ']))).toBe(`<a href="mailto:a@example.com" ${look}>mailto:a@example.com</a>`)
  })

  it('shows text and spans in order inside the link, in no paragraph', () => {
    const link = node('Link', { href: 'mailto:a@example.com' }, ['Mail ', node('Text', { as: 'span', className: 'font-semibold' }, ['Sam'])])
    expect(html(link)).toBe(`<a href="mailto:a@example.com" ${look}>Mail <span class="font-semibold">Sam</span></a>`)
  })

  it('runs inline in the one paragraph of a Text', () => {
    expect(html(node('Text', {}, ['Write to ', node('Link', { href: 'mailto:a@example.com' }, ['Sam'])]))).toBe(`<p>Write to <a href="mailto:a@example.com" ${look}>Sam</a></p>`)
  })

  it('fills its address from the page parameters', () => {
    const tree = SelectInput({ source: 'window', choices: [{ id: '7d', name: 'Last 7 days' }, { id: '30d', name: 'Last 30 days' }] })
    const link = node('Link', { to: { kind: 'record', resource: 'windows', key: '{{@params.window}}' } }, ['Window'])
    const markup = renderToStaticMarkup(
      <Router initialUrl="/claims?window=30d">
        <PageParamsProvider page="claims" tree={tree} given={{ window: '30d' }}>
          <RenderNode node={link} />
        </PageParamsProvider>
      </Router>,
    )
    expect(markup).toBe(`<a href="/windows/30d" ${look}>Window</a>`)
  })

  it('carries a page parameter to another page', () => {
    const tree = SelectInput({ source: 'window', choices: [{ id: '7d', name: 'Last 7 days' }, { id: '30d', name: 'Last 30 days' }] })
    const link = node('Link', { to: { kind: 'page', page: 'payouts', params: { window: '{{@params.window}}' } } }, ['Payouts'])
    const markup = renderToStaticMarkup(
      <Router initialUrl="/claims?window=30d">
        <PageParamsProvider page="claims" tree={tree} given={{ window: '30d' }}>
          <RenderNode node={link} />
        </PageParamsProvider>
      </Router>,
    )
    expect(markup).toBe(`<a href="/payouts?window=30d" ${look}>Payouts</a>`)
  })
})
