/** What a processor gets: the stored upload's decided type, size and name, its first bytes, and the whole of it on demand. */
export type FileProcessorInput = {
  name: string
  type: string
  size: number
  /** The first bytes of the content (up to 256 KB), enough for image headers. */
  head: Uint8Array
  /** The whole content, read from storage. */
  read(): Promise<ReadableStream<Uint8Array>>
}

/**
 * Computes a value for another column from an upload (`.derive()`). It runs once, on the upload route; a file whose type
 * is not in `accepts` leaves the column null.
 */
export type FileProcessor = {
  /** Exact types and `type/*` wildcards; every type when omitted. */
  accepts?: readonly string[]
  run: (file: FileProcessorInput) => unknown
}

/** A file field's settings, as the builder collects them. */
export type FileOptions = {
  accept: string[]
  maxSize: number
  provider: string
  derive?: Record<string, FileProcessor>
}

export const defaultMaxSize = 50_000_000

const units: Record<string, number> = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3 }

/** Bytes from a number or text such as `10 MB` (decimal units) or `5 MiB` (binary units). */
export const parseSize = (size: number | string): number => {
  if (typeof size === 'number') {
    if (!Number.isSafeInteger(size) || size <= 0) throw new Error(`A file size must be a positive whole number of bytes, not ${size}`)
    return size
  }
  const match = /^\s*(\d+(?:\.\d+)?)\s*([a-z]+)?\s*$/i.exec(size)
  const unit = units[(match?.[2] ?? 'b').toLowerCase()]
  if (!match || !unit) throw new Error(`"${size}" is not a size; write it like "10 MB" or "512 KiB"`)
  return parseSize(Math.round(Number(match[1]) * unit))
}

const typePattern = /^(?:\*\/\*|[a-z0-9][a-z0-9!#$&^_.+-]*\/(?:\*|[a-z0-9][a-z0-9!#$&^_.+-]*))$/

/** Allowed types, lowercased: exact types and `type/*` wildcards; `*` alone is refused so that every type is a choice. */
export const checkedAccept = (types: readonly string[]) =>
  types.map((type) => {
    const lower = type.trim().toLowerCase()
    if (!typePattern.test(lower)) throw new Error(`"${type}" is not a media type or a type/* wildcard`)
    return lower
  })

const providerPattern = /^[a-z][a-z0-9-]{0,31}$/
// A stored value starting with one of these would read as a link or another standard URI.
const reservedProviders = new Set(['http', 'https', 'data', 'blob', 'file', 'javascript', 'mailto'])

/** A provider name: lowercase, at most 32 characters, and not a scheme browsers already know. */
export const checkedProvider = (name: string) => {
  if (!providerPattern.test(name)) throw new Error(`"${name}" is not a file provider name: lowercase letters, digits and dashes, starting with a letter`)
  if (reservedProviders.has(name)) throw new Error(`"${name}" cannot name a file provider: stored values would read as ${name}: links`)
  return name
}
