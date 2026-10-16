import { Marked, type Tokens } from 'marked'

export type MarkdownHtmlOptions = {
  /** The HTML goes inside a link, such as a card: its links become their text and its images their alt text. */
  inLink?: boolean
}

const escapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => escapes[char]!)

const scheme = /^([a-z][a-z0-9+.-]*):/i
const linkSchemes = new Set(['http', 'https', 'mailto', 'tel'])
const imageSchemes = new Set(['http', 'https'])

// The browser drops these from an address, so `java\tscript:` is still a script
const ignoredByBrowsers = /[\u0000-\u0020\u007f]/g

// An address percent-encoded as marked does, or null when it leaves the allowed schemes, such as `javascript:`.
const safeAddress = (href: string, schemes: ReadonlySet<string>) => {
  const named = scheme.exec(href.replace(ignoredByBrowsers, ''))?.[1]?.toLowerCase()
  if (named !== undefined && !schemes.has(named)) return null
  try {
    return encodeURI(href).replace(/%25/g, '%')
  } catch (error) {
    if (error instanceof URIError) return null
    throw error
  }
}

const titled = (title: string | null | undefined) => (title ? ` title="${escapeHtml(title)}"` : '')

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
        return `<a href="${escapeHtml(address)}"${titled(title)} target="_blank" rel="noopener noreferrer nofollow">${text}</a>`
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
 * tel addresses or relative ones, and links opening in a new tab. The page sanitises the result again before showing it.
 */
export const markdownHtml = (source: string, options: MarkdownHtmlOptions = {}) =>
  (options.inLink ? parsers.inLink : parsers.page).parse(source, { async: false })
