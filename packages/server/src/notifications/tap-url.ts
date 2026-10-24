// No whitespace or control character anywhere: a URL parser drops some silently, so `java\tscript:` would parse as
// `javascript:`, and a leading space or NUL would hide the scheme from a plain prefix check.
const plain = /^[^\s\u0000-\u001f\u007f-\u009f]+$/

/**
 * The URL a notification opens on tap, as the WHATWG parser writes it, or `undefined` when it is no absolute `http` or
 * `https` URL: a relative or scheme-relative URL, `javascript:`, `data:`, `file:`, `blob:` and every other scheme are
 * refused, since they would run or show content on tap. Any origin is allowed.
 */
export const tapUrl = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 2048 || !plain.test(value) || !URL.canParse(value)) return undefined
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
  return url.href
}
