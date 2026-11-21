const escapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Text as HTML that shows it as written. */
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => escapes[char]!)

const scheme = /^([a-z][a-z0-9+.-]*):/i
export const linkSchemes: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'tel'])
export const imageSchemes: ReadonlySet<string> = new Set(['http', 'https'])

// The browser drops these from an address, so `java\tscript:` is still a script
const ignoredByBrowsers = /[\u0000- \u007f]/g

/** An address percent-encoded as marked does, or null when it leaves the allowed schemes, such as `javascript:`. */
export const safeAddress = (href: string, schemes: ReadonlySet<string>) => {
  const named = scheme.exec(href.replace(ignoredByBrowsers, ''))?.[1]?.toLowerCase()
  if (named !== undefined && !schemes.has(named)) return null
  try {
    return encodeURI(href).replace(/%25/g, '%')
  } catch (error) {
    if (error instanceof URIError) return null
    throw error
  }
}

export const titled = (title: string | null | undefined) => (title ? ` title="${escapeHtml(title)}"` : '')

/** A link that opens in a new tab without handing it the page. */
export const newTabLink = (address: string, title: string | null | undefined, html: string) =>
  `<a href="${escapeHtml(address)}"${titled(title)} target="_blank" rel="noopener noreferrer nofollow">${html}</a>`
