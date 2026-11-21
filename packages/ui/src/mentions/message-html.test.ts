import { describe, expect, it } from 'vitest'
import { mentionClass } from './mention-text'
import { messageHtml } from './message-html'

const ann = [{ name: 'Ann' }]

describe('messageHtml', () => {
  it('renders bold, italic, strikethrough and inline code, keeping line breaks', () => {
    expect(messageHtml('**bold** _italic_ *also* ~~gone~~ `code`\nnext', [])).toBe(
      '<p><strong>bold</strong> <em>italic</em> <em>also</em> <del>gone</del> <code>code</code><br>next</p>\n',
    )
  })

  it('renders code blocks, lists and quotes', () => {
    expect(messageHtml('```\nlet a = 1\n```', [])).toBe('<pre><code>let a = 1\n</code></pre>\n')
    expect(messageHtml('- one\n- two\n\n1. first', [])).toBe('<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n<ol>\n<li>first</li>\n</ol>\n')
    expect(messageHtml('> quoted', [])).toBe('<blockquote>\n<p>quoted</p>\n</blockquote>\n')
  })

  it('keeps what looks like markdown inside code as written', () => {
    expect(messageHtml('`**not bold** @Ann <b>`', ann)).toBe('<p><code>**not bold** @Ann &lt;b&gt;</code></p>\n')
    expect(messageHtml('```\n_x_ https://example.com\n```', [])).toBe('<pre><code>_x_ https://example.com\n</code></pre>\n')
  })

  it('makes web addresses links that open in a new tab', () => {
    const link = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>`
    expect(messageHtml('See https://example.com/a?b=1 and www.example.org', [])).toBe(
      `<p>See ${link('https://example.com/a?b=1', 'https://example.com/a?b=1')} and ${link('http://www.example.org', 'www.example.org')}</p>\n`,
    )
    expect(messageHtml('[the docs](https://docs.protobase.net)', [])).toBe(`<p>${link('https://docs.protobase.net', 'the docs')}</p>\n`)
  })

  it('never makes a script link or raw HTML live', () => {
    expect(messageHtml('[click](javascript:alert(1))', [])).toBe('<p>click</p>\n')
    expect(messageHtml('<javascript:alert(1)>', [])).not.toContain('<a')
    expect(messageHtml('Hi <img src=x onerror="alert(1)"> there', [])).toBe('<p>Hi &lt;img src=x onerror=&quot;alert(1)&quot;&gt; there</p>\n')
    expect(messageHtml('<script>alert(1)</script>', [])).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
  })

  it('leaves headings, rules, tables, images, link definitions and indented text as typed', () => {
    expect(messageHtml('# not a heading', [])).toBe('<p># not a heading</p>\n')
    expect(messageHtml('done\n---', [])).toBe('<p>done<br>---</p>\n')
    expect(messageHtml('Total\n===', [])).toBe('<p>Total<br>===</p>\n')
    expect(messageHtml('    pasted log line', [])).toBe('<p>    pasted log line</p>\n')
    expect(messageHtml('| a |\n| - |', [])).toBe('<p>| a |<br>| - |</p>\n')
    expect(messageHtml('![chart](https://example.com/c.png)', [])).toBe('<p>![chart](https://example.com/c.png)</p>\n')
    expect(messageHtml('[x]: https://example.com', [])).toContain('[x]: ')
  })

  it('follows chat habits where markdown would surprise', () => {
    expect(messageHtml('> it was the fan\nAgreed.', [])).toBe('<blockquote>\n<p>it was the fan</p>\n</blockquote>\n<p>Agreed.</p>\n')
    expect(messageHtml('- one\nThanks!', [])).toBe('<ul>\n<li>one</li>\n</ul>\n<p>Thanks!</p>\n')
    expect(messageHtml('>5 failed logins', [])).toBe('<p>&gt;5 failed logins</p>\n')
    expect(messageHtml('rename __init__ and src/**/*.ts', [])).toBe('<p>rename __init__ and src/**/*.ts</p>\n')
  })

  it('shows the address a link opens when its text names another', () => {
    expect(messageHtml('[https://acme.example/billing](https://evil.example)', [])).toBe(
      '<p><a href="https://evil.example" target="_blank" rel="noopener noreferrer nofollow">https://evil.example</a></p>\n',
    )
    expect(messageHtml('[acme.example](https://acme.example/billing)', [])).toContain('>acme.example</a>')
  })

  it('picks out a mention inside formatted text, and not one of someone it does not mention', () => {
    const mention = (name: string) => `<span class="${mentionClass.replace('&', '&amp;')}">@${name}</span>`
    expect(messageHtml('**Thanks @Ann!** and @Bo', ann)).toBe(`<p><strong>Thanks ${mention('Ann')}!</strong> and @Bo</p>\n`)
    expect(messageHtml('- ask @Ann de Vries', [{ name: 'Ann de Vries' }])).toBe(`<ul>\n<li>ask ${mention('Ann de Vries')}</li>\n</ul>\n`)
    expect(messageHtml("> @Tom & O'Neil", [{ name: "Tom & O'Neil" }])).toBe(`<blockquote>\n<p>${mention('Tom &amp; O&#39;Neil')}</p>\n</blockquote>\n`)
  })
})
