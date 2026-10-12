// What a secret is replaced with.
const redacted = '[Filtered]'

// Header, cookie, field and query parameter names whose values are credentials; `sig` signs file download URLs.
const secretName = /authorization|cookie|passw|secret|token|api[-_]?key|credential|session|csrf|signature|^sig$/i

// The keys whose string values are URLs or query strings, as error events name them.
const urlKeys = new Set(['url', 'query_string', 'from', 'to'])

// Nested deeper than this is left as it is: an error event is shallow, and the limit keeps a cyclic value finite.
const maxDepth = 12

const redactQuery = (query: string) =>
  query.replace(/(^|&)([^=&]*)=([^&]*)/g, (pair, separator: string, name: string) => (secretName.test(name) ? `${separator}${name}=${redacted}` : pair))

const redactUrl = (url: string) => {
  const start = url.indexOf('?')
  if (start === -1) return url
  const end = url.indexOf('#', start)
  const query = end === -1 ? url.slice(start + 1) : url.slice(start + 1, end)
  return `${url.slice(0, start + 1)}${redactQuery(query)}${end === -1 ? '' : url.slice(end)}`
}

const redactValue = (key: string, value: unknown, depth: number): unknown => {
  if (secretName.test(key)) return redacted
  if (typeof value === 'string' && urlKeys.has(key)) return key === 'query_string' ? redactQuery(value) : redactUrl(value)
  return redactWithin(value, depth + 1)
}

const redactWithin = (value: unknown, depth: number): unknown => {
  if (depth > maxDepth || typeof value !== 'object' || value === null) return value
  // A list of [name, value] pairs, as a query string or headers can be.
  if (Array.isArray(value)) {
    return value.map((item) => (Array.isArray(item) && item.length === 2 && typeof item[0] === 'string' ? [item[0], redactValue(item[0], item[1], depth)] : redactWithin(item, depth + 1)))
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(key, item, depth)]))
}

/**
 * A copy of an error event, or any plain value, without the credentials it carries: the value of every key that names
 * one (authorization headers, cookies, passwords, tokens, API keys) and of every such query parameter in a URL.
 */
export const redactSecrets = <T>(value: T): T => redactWithin(value, 0) as T
