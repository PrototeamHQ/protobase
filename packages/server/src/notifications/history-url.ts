// A path on the app itself: `/`, then neither `/` nor `\`, which browsers read as another host, and no whitespace or
// control character, which a URL parser drops silently.
const ownPath = /^\/(?![/\\])[^\s\u0000-\u001f\u007f-\u009f]*$/

const absolute = /^https?:\/\//i

/**
 * The url an entry of the history may lead to, as an answer shows it, or `null`: a path on the app, or an absolute
 * `http` or `https` URL without user info whose origin is exactly one of `origins`, the app's own, written as the URL
 * parser writes it. Anything else, another site, `javascript:`, `data:` or a scheme-relative URL, is `null`.
 */
export const historyUrl = (url: string | null, origins: readonly string[]) => {
  if (url === null || url.length > 2048) return null
  if (ownPath.test(url)) return url
  if (!absolute.test(url) || !URL.canParse(url) || /[\s\u0000-\u001f\u007f-\u009f]/.test(url)) return null
  const parsed = new URL(url)
  if (parsed.username !== '' || parsed.password !== '') return null
  return origins.some((origin) => URL.canParse(origin) && new URL(origin).origin === parsed.origin) ? parsed.href : null
}
