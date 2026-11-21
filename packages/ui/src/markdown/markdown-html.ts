import { Marked, type Tokens } from 'marked'
import { nestedHeadingLevel } from './nested-heading-level'
import { escapeHtml, imageSchemes, linkSchemes, newTabLink, safeAddress, titled } from './safe-html'

export type MarkdownHtmlOptions = {
  /** The HTML goes inside a link, such as a card: its links become their text and its images their alt text. */
  inLink?: boolean
  /** The level of the heading the HTML sits under, whose level its own headings go below; 0, the default, keeps them. */
  headingsUnder?: number
}

const parser = ({ inLink = false }: MarkdownHtmlOptions) =>
  new Marked({
    gfm: true,
    // A line break in the text is one on the page, as in a comment on GitHub
    breaks: true,
    renderer: {
      // Raw HTML shows as the text it is, never as markup
      html: ({ text, block }: Tokens.HTML | Tokens.Tag) => (block ? `<p>${escapeHtml(text)}</p>` : escapeHtml(text)),
      link({ href, title, tokens }: Tokens.Link) {
        const text = this.parser.parseInline(tokens)
        const address = inLink ? null : safeAddress(href, linkSchemes)
        if (address === null) return text
        return newTabLink(address, title, text)
      },
      image({ href, title, text }: Tokens.Image) {
        const address = inLink ? null : safeAddress(href, imageSchemes)
        if (address === null) return escapeHtml(text)
        return `<img src="${escapeHtml(address)}" alt="${escapeHtml(text)}"${titled(title)} loading="lazy">`
      },
    },
  })

const parsers = { inLink: parser({ inLink: true }), page: parser({}) }

/**
 * Markdown as HTML (GitHub's flavour, line breaks kept): raw HTML escaped, links and images only to http(s), mailto and
 * tel addresses or relative ones, links opening in a new tab and headings below `headingsUnder`. The page sanitises the
 * result again before showing it.
 */
export const markdownHtml = (source: string, { inLink = false, headingsUnder = 0 }: MarkdownHtmlOptions = {}) => {
  const markdown = inLink ? parsers.inLink : parsers.page
  const tokens = markdown.lexer(source)
  markdown.walkTokens(tokens, (token) => {
    if (token.type === 'heading') token.depth = nestedHeadingLevel(token.depth, headingsUnder)
  })
  return markdown.parser(tokens)
}
