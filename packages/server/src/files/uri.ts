import { sha256Hex } from '../hash'

/**
 * A stored file value: `{provider}:{path}?name=<name>&size=<bytes>`, such as `private:acme/2992db9c-….jpg?name=bike.png&size=48211`.
 * It is an ordinary URI whose scheme is the provider's name; `public:images/test.jpg`, without a query, parses too.
 * The part before `?` is the file's identity; the query is metadata about bytes that never change, and names the image
 * variants stored beside it with their extension: `&variants=card.webp,thumb.avif`.
 */
export type FileRef = { provider: string; path: string; name: string; size?: number; variants?: Record<string, string> }

const provider = /^[a-z][a-z0-9-]{0,31}$/
// No segment starts with a dot, so `..`, hidden files and the store's own `.cleanup/` folder are never a file's path.
const segment = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/
const maxPath = 512

export const isFilePath = (path: string) => path.length <= maxPath && path.split('/').every((part) => segment.test(part))

/** The identity of a value or ticket: `{provider}:{path}`. */
export const baseOf = (value: string) => value.split('?', 1)[0]!

const variantEntry = /^([a-z][a-z0-9_]{0,31})\.([a-z0-9]{1,8})$/

/**
 * Where a file's variant is stored: beside it, its path followed by the variant's name and extension, such as
 * `acme/2992db9c-….jpg.card.webp`. Every variant's address is built here.
 */
export const variantPath = (path: string, name: string, extension: string) => `${path}.${name}.${extension}`

/** The paths of a file's variants, by name. */
export const variantPaths = (ref: FileRef) =>
  Object.fromEntries(Object.entries(ref.variants ?? {}).map(([name, extension]) => [name, variantPath(ref.path, name, extension)]))

const formatVariants = (variants: Record<string, string>) => Object.entries(variants).map(([name, extension]) => `${name}.${extension}`).join(',')

// `card.webp,thumb.avif`; `undefined` when any entry is not a variant name and extension.
const parseVariants = (text: string) => {
  const entries = text.split(',').map((entry) => variantEntry.exec(entry))
  if (entries.some((entry) => !entry)) return undefined
  return Object.fromEntries(entries.map((entry) => [entry![1]!, entry![2]!]))
}

export const formatUri = (ref: FileRef) => {
  const query = new URLSearchParams({
    name: ref.name,
    ...(ref.size !== undefined && { size: String(ref.size) }),
    ...(ref.variants && Object.keys(ref.variants).length > 0 && { variants: formatVariants(ref.variants) }),
  })
  return `${ref.provider}:${ref.path}?${query}`
}

const lastSegment = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** The file a value names, or `undefined` when it does not parse. */
export const parseUri = (value: string): FileRef | undefined => {
  const match = /^([a-z][a-z0-9-]*):([^?#]+)(?:\?([^#]*))?$/.exec(value)
  if (!match || !provider.test(match[1]!) || !isFilePath(match[2]!)) return undefined
  const query = new URLSearchParams(match[3] ?? '')
  const size = query.get('size')
  if (size !== null && !/^\d{1,15}$/.test(size)) return undefined
  const listed = query.get('variants')
  const variants = listed === null ? undefined : parseVariants(listed)
  if (listed !== null && !variants) return undefined
  return {
    provider: match[1]!,
    path: match[2]!,
    name: query.get('name') || lastSegment(match[2]!),
    ...(size !== null && { size: Number(size) }),
    ...(variants && { variants }),
  }
}

const encoder = new TextEncoder()

/** The uploader's file name without a path or control characters, at most 255 bytes; `file` when nothing is left. */
export const cleanName = (name: string | undefined) => {
  const text = name ?? ''
  let clean = text.slice(Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\')) + 1).replace(/[\u0000-\u001f\u007f]/g, '').trim()
  while (encoder.encode(clean).length > 255) clean = clean.slice(0, -1)
  return clean || 'file'
}

const tenantText = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

/** The first path segment of an upload: the row's tenant as it is when it fits, a hash of it when not, `_` without one. */
export const tenantSegment = async (tenant: string | number | undefined) => {
  if (tenant === undefined) return '_'
  const text = String(tenant)
  return tenantText.test(text) ? text : `t${(await sha256Hex(text)).slice(0, 32)}`
}
