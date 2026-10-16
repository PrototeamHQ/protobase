import { describe, expect, it } from 'vitest'
import { markdownHtml } from './markdown-html'

describe('markdownHtml', () => {
  it('renders GitHub-flavoured markdown, keeping line breaks', () => {
    expect(markdownHtml('# Plan\n\n**Bold** and _italic_\nnext line\n\n- [x] done\n- open')).toBe(
      '<h1>Plan</h1>\n<p><strong>Bold</strong> and <em>italic</em><br>next line</p>\n<ul>\n<li><input checked="" disabled="" type="checkbox"> done</li>\n<li>open</li>\n</ul>\n',
    )
  })

  it('shows raw HTML as text, inline and as a block', () => {
    expect(markdownHtml('Hi <img src=x onerror="alert(1)"> there')).toBe('<p>Hi &lt;img src=x onerror=&quot;alert(1)&quot;&gt; there</p>\n')
    expect(markdownHtml('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
  })

  it('opens a link in a new tab without handing it the page', () => {
    expect(markdownHtml('[Docs](https://docs.protobase.net "The docs")')).toBe(
      '<p><a href="https://docs.protobase.net" title="The docs" target="_blank" rel="noopener noreferrer nofollow">Docs</a></p>\n',
    )
    expect(markdownHtml('<https://example.com/a?b=1&c=2>')).toBe(
      '<p><a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow">https://example.com/a?b=1&amp;c=2</a></p>\n',
    )
  })

  it('keeps mailto, tel and relative links', () => {
    expect(markdownHtml('[a](mailto:a@example.com) [b](tel:+3120) [c](/orders/1) [d](#top)')).toContain('href="mailto:a@example.com"')
    expect(markdownHtml('[c](/orders/1) [d](#top)')).toMatch(/href="\/orders\/1".*href="#top"/)
    expect(markdownHtml('[b](tel:+3120)')).toContain('href="tel:+3120"')
  })

  it('drops a link to a script or data address, keeping its text', () => {
    expect(markdownHtml('[click](javascript:alert(1))')).toBe('<p>click</p>\n')
    expect(markdownHtml('[click](JavaScript:alert(1))')).toBe('<p>click</p>\n')
    expect(markdownHtml('[click](data:text/html,<b>x</b>)')).toBe('<p>click</p>\n')
    expect(markdownHtml('[click](vbscript:msgbox)')).toBe('<p>click</p>\n')
    expect(markdownHtml('[click](<java\tscript:alert(1)>)')).toBe('<p>click</p>\n')
    expect(markdownHtml('[click](<java\nscript:alert(1)>)')).not.toContain('<a')
  })

  it('shows an image from the web, and the alt text of one from another address', () => {
    expect(markdownHtml('![Plan](https://example.com/plan.png)')).toBe('<p><img src="https://example.com/plan.png" alt="Plan" loading="lazy"></p>\n')
    expect(markdownHtml('![Plan](javascript:alert(1))')).toBe('<p>Plan</p>\n')
    expect(markdownHtml('![<b>x</b>](data:image/png;base64,AA)')).toBe('<p>&lt;b&gt;x&lt;/b&gt;</p>\n')
  })

  it('inside a link keeps the text of links and images', () => {
    expect(markdownHtml('See [the plan](https://example.com) ![chart](https://example.com/c.png)', { inLink: true })).toBe('<p>See the plan chart</p>\n')
  })

  it('escapes code', () => {
    expect(markdownHtml('`<b>` and\n\n```\n<script>\n```')).toBe('<p><code>&lt;b&gt;</code> and</p>\n<pre><code>&lt;script&gt;\n</code></pre>\n')
  })
})
