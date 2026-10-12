// A file field's value whose download URL is a path on the origin of the API that served it.
const isFileAtPath = (value: unknown): value is { uri: string; url: string } => {
  if (typeof value !== 'object' || value === null) return false
  const { uri, url } = value as { uri?: unknown; url?: unknown }
  return typeof uri === 'string' && typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')
}

/** The origin of an absolute `baseUrl`; `undefined` for a path on the page's own origin. */
export const originOf = (baseUrl: string | undefined) => (baseUrl !== undefined && URL.canParse(baseUrl) ? new URL(baseUrl).origin : undefined)

/**
 * Makes each file of a record download from `origin`: the API answers a file's URL as a path on its own origin, which a
 * page on another origin, or code outside a page, cannot follow. Without an origin the record is returned as it is.
 */
export const withFileOrigin = <T>(record: T, origin: string | undefined): T => {
  if (origin === undefined || typeof record !== 'object' || record === null) return record
  return Object.fromEntries(Object.entries(record).map(([name, value]) => [name, isFileAtPath(value) ? { ...value, url: `${origin}${value.url}` } : value])) as T
}
