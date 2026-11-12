import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HeadingLevel, useHeadingLevel } from '../lib/heading-level'
import { Section } from './section'

// The heading level a section's content sits under, shown as text
const Under = () => createElement('i', null, `under ${useHeadingLevel()}`)
const section = (props: { level?: 2 | 3 | 4 | 5 | 6 } = {}) => createElement(Section, { title: 'Doing', ...props, children: createElement(Under) })
const render = (element: ReturnType<typeof section>, under?: number) =>
  renderToStaticMarkup(under === undefined ? element : createElement(HeadingLevel.Provider, { value: under }, element))

describe('Section', () => {
  it('heads with h2 at the top of a page', () => {
    const html = render(section())
    expect(html).toMatch(/<h2 [^>]*>Doing<\/h2>/)
    expect(html).toContain('under 2')
  })

  it('heads one below the heading it sits under, such as h3 in a group', () => {
    const html = render(section(), 2)
    expect(html).toMatch(/<h3 [^>]*>Doing<\/h3>/)
    expect(html).toContain('under 3')
  })

  it('heads with its level when it is given one', () => {
    const html = render(section({ level: 4 }))
    expect(html).toMatch(/<h4 [^>]*>Doing<\/h4>/)
    expect(html).toContain('under 4')
  })

  it('stops at h6', () => {
    expect(render(section(), 6)).toMatch(/<h6 [^>]*>Doing<\/h6>/)
  })
})
