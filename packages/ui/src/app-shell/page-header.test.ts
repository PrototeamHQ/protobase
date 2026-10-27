import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PageHeader, type PageHeaderProps } from './page-header'

const actions = createElement('button', null, 'New')
const render = (props: PageHeaderProps) => renderToStaticMarkup(createElement(PageHeader, props))
// Classes stripped, so a test reads the element tree alone.
const tree = (html: string) => html.replace(/ class="[^"]*"/g, '')

describe('PageHeader with the subtitle below', () => {
  it('puts the title and actions in one wrapping row, then the subtitle on its own line', () => {
    const html = render({ title: 'Orders', subtitle: 'Every order placed.', actions, subtitleBelow: true })
    expect(tree(html)).toBe('<div><div><h1>Orders</h1><div><button>New</button></div></div><p>Every order placed.</p></div>')
    expect(html).toContain('<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 md:flex-nowrap">')
  })

  it('leaves out the subtitle line when there is no subtitle', () => {
    const html = render({ title: 'Orders', actions, subtitleBelow: true })
    expect(tree(html)).toBe('<div><div><h1>Orders</h1><div><button>New</button></div></div></div>')
  })

  it('leaves out the actions box when there are no actions', () => {
    const html = render({ title: 'Orders', subtitle: 'Every order placed.', subtitleBelow: true })
    expect(tree(html)).toBe('<div><div><h1>Orders</h1></div><p>Every order placed.</p></div>')
  })
})

describe('PageHeader with the subtitle beside the actions', () => {
  it('keeps the subtitle under the title, in the column left of the actions', () => {
    const html = render({ title: 'Orders', subtitle: 'Every order placed.', actions })
    expect(tree(html)).toBe('<div><div><h1>Orders</h1><p>Every order placed.</p></div><div><button>New</button></div></div>')
  })
})
