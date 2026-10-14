/** What a processor gets: the stored upload's decided type, size and name, its first bytes, and the whole of it on demand. */
export type FileProcessorInput = {
  /** The file's name, its extension matched to the decided type. */
  name: string
  /** The type decided from the content, such as `image/jpeg`. */
  type: string
  /** The size in bytes. */
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
  /** The value for the column, which must pass that field's schema. */
  run: (file: FileProcessorInput) => unknown
}

/** The formats an image variant is written in. */
export const imageFormats = ['webp', 'avif', 'jpeg', 'png'] as const

/** A format an image variant is written in: `webp`, `avif`, `jpeg` or `png`. */
export type ImageFormat = (typeof imageFormats)[number]

/**
 * A resized copy of an uploaded image: at most `width` by `height` pixels, never enlarged. `inside` (the default) keeps
 * the whole image within that box, `cover` fills the box and crops what is outside it. `quality` is 1 to 100, the
 * format's default when omitted.
 */
export type ImageVariant = {
  /** The largest width in pixels; any width when omitted. */
  width?: number
  /** The largest height in pixels; any height when omitted. */
  height?: number
  /** `inside` keeps the whole image within the box; `cover` fills the box and crops the rest, and needs both sides. */
  fit?: 'inside' | 'cover'
  /** The format it is written in. */
  format: ImageFormat
  /** 1 to 100; the format's default when omitted. */
  quality?: number
}

/** `.variants()`' second argument: `original` replaces the upload by that image, so the upload itself is not kept. */
export type ImageVariantOptions = {
  /** The image stored instead of the upload, such as `{ width: 2560, format: 'webp' }`. */
  original?: ImageVariant
}

/** A file field's settings, as the builder collects them. */
export type FileOptions = {
  /** The allowed types and `type/*` wildcards (`.accept()`); any type when empty. */
  accept: string[]
  /** The largest upload in bytes (`.maxSize()`). */
  maxSize: number
  /** The provider of `files.providers` the files are stored with (`.storage()`, `.public()`). */
  provider: string
  /** The processors computing other fields from each upload, by field name (`.derive()`). */
  derive?: Record<string, FileProcessor>
  /** The read-only text field each image's ThumbHash goes to (`.placeholder()`). */
  placeholder?: string
  /** The resized copies stored beside each image, by name (`.variants()`). */
  variants?: Record<string, ImageVariant>
  /** The image stored instead of the upload (`.variants()`' `original`). */
  original?: ImageVariant
  /** Whether a value may also be an https URL of a file elsewhere (`.externalUrls()`). */
  external?: true
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

const variantNamePattern = /^[a-z][a-z0-9_]{0,31}$/
const fits = ['inside', 'cover']

// A pixel bound of a variant: a whole number from 1 to 16384, the largest side WebP can hold.
const checkedBound = (label: string, value: number | undefined) => {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > 16_384)) throw new Error(`${label} must be a whole number of pixels from 1 to 16384, not ${value}`)
}

/** A variant as written, checked: a known format and fit, and bounds and a quality in range. */
export const checkedVariant = (label: string, variant: ImageVariant): ImageVariant => {
  if (!(imageFormats as readonly string[]).includes(variant.format)) throw new Error(`${label}: "${variant.format}" is not an image format; use ${imageFormats.join(', ')}`)
  if (variant.fit !== undefined && !fits.includes(variant.fit)) throw new Error(`${label}: fit is "inside" or "cover", not "${variant.fit}"`)
  if (variant.fit === 'cover' && (variant.width === undefined || variant.height === undefined)) throw new Error(`${label}: fit "cover" needs both a width and a height`)
  checkedBound(`${label}: width`, variant.width)
  checkedBound(`${label}: height`, variant.height)
  if (variant.quality !== undefined && (!Number.isSafeInteger(variant.quality) || variant.quality < 1 || variant.quality > 100)) {
    throw new Error(`${label}: quality must be a whole number from 1 to 100, not ${variant.quality}`)
  }
  return { ...variant }
}

/** Variants by name: snake_case names, since each one is part of its file's path. */
export const checkedVariants = (variants: Record<string, ImageVariant>) =>
  Object.fromEntries(
    Object.entries(variants).map(([name, variant]) => {
      if (!variantNamePattern.test(name)) throw new Error(`"${name}" cannot name an image variant: lowercase letters, digits and underscores, starting with a letter`)
      return [name, checkedVariant(`Image variant "${name}"`, variant)]
    }),
  )
