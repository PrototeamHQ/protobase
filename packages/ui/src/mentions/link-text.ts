// Link text that reads as a web address: a scheme, `www.` or a dotted host, then a path, query or nothing
const addressLike = /^(?:[a-z][a-z0-9+.-]*:\/\/)?((?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,})(?::\d+)?(?:[/?#]\S*)?$/iu

const hostOf = (address: string) => {
  if (!URL.canParse(address)) return
  return new URL(address).hostname.toLowerCase()
}

/**
 * Whether a link's text names a web address on another host than the link opens, such as
 * `[https://example.com](https://elsewhere.example)`, so the reader would be misled about where it goes.
 */
export const misleadingLinkText = (text: string, href: string) => {
  const named = addressLike.exec(text.trim())?.[1]
  if (!named) return false
  return hostOf(href) !== new URL(`http://${named}`).hostname.toLowerCase()
}
