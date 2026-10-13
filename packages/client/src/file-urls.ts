import type { StoredFile } from './types'

const isPath = (url: string) => url.startsWith('/') && !url.startsWith('//')

type FileAtPath = { uri: string; url: string; variants?: Record<string, { url: string }> }

// A file field's value whose download URL is a path on the origin of the API that served it.
const isFileAtPath = (value: unknown): value is FileAtPath => {
  if (typeof value !== 'object' || value === null) return false
  const { uri, url } = value as { uri?: unknown; url?: unknown }
  return typeof uri === 'string' && typeof url === 'string' && isPath(url)
}

/** The origin of an absolute `baseUrl`; `undefined` for a path on the page's own origin. */
export const originOf = (baseUrl: string | undefined) => (baseUrl !== undefined && URL.canParse(baseUrl) ? new URL(baseUrl).origin : undefined)

const fromOrigin = (file: FileAtPath, origin: string): FileAtPath => ({
  ...file,
  url: `${origin}${file.url}`,
  ...(file.variants && {
    variants: Object.fromEntries(Object.entries(file.variants).map(([name, variant]) => [name, isPath(variant.url) ? { ...variant, url: `${origin}${variant.url}` } : variant])),
  }),
})

/**
 * Makes each file of a record download from `origin`, its variants too: the API answers a file's URL as a path on its
 * own origin, which a page on another origin, or code outside a page, cannot follow. Without an origin the record is
 * returned as it is.
 */
export const withFileOrigin = <T>(record: T, origin: string | undefined): T => {
  if (origin === undefined || typeof record !== 'object' || record === null) return record
  return Object.fromEntries(Object.entries(record).map(([name, value]) => [name, isFileAtPath(value) ? fromOrigin(value, origin) : value])) as T
}

/**
 * The link of a stored file, or of its variant by that name when it has one (`fileUrl(listing.photo, 'card')`); the
 * file's own link otherwise, and `undefined` for a missing file or one without a link.
 */
export const fileUrl = (file: StoredFile, variant?: string) => {
  if ('missing' in file) return undefined
  return (variant === undefined ? undefined : file.variants?.[variant]?.url) ?? file.url
}
