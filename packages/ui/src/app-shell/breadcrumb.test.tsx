import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Breadcrumb, type Crumb } from './breadcrumb'

const trail = (parts: Crumb[]) => renderToStaticMarkup(<Breadcrumb parts={parts} trailing={<i id="mark" />} />)

describe('Breadcrumb', () => {
  it('puts the trailing mark right after the current page, in its crumb', () => {
    expect(trail(['Orders', 'SO-1'])).toContain('SO-1</span><i id="mark"></i></span></nav>')
  })

  it('puts it after the trail when the last crumb is no current page, which a phone hides', () => {
    const html = trail(['Orders', { label: 'Customers', href: '/customers', above: true }])
    expect(html).toMatch(/Customers<\/a><\/span><i id="mark"><\/i><\/nav>$/)
    expect(html.match(/id="mark"/g)).toHaveLength(1)
  })
})
