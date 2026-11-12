/**
 * The one table between types and extensions. An upload's decided type picks its path's extension, and every download's
 * Content-Type is looked up from that extension here, so what is served never comes from a client's header.
 */
const table: Array<[type: string, extensions: string[]]> = [
  ['image/png', ['png']],
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/gif', ['gif']],
  ['image/webp', ['webp']],
  ['image/avif', ['avif']],
  ['image/heic', ['heic']],
  ['image/bmp', ['bmp']],
  ['image/tiff', ['tif', 'tiff']],
  ['image/x-icon', ['ico']],
  ['image/svg+xml', ['svg']],
  ['application/pdf', ['pdf']],
  ['application/zip', ['zip']],
  ['application/gzip', ['gz']],
  ['application/x-tar', ['tar']],
  ['application/x-7z-compressed', ['7z']],
  ['application/vnd.rar', ['rar']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['docx']],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['xlsx']],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', ['pptx']],
  ['application/vnd.oasis.opendocument.text', ['odt']],
  ['application/vnd.oasis.opendocument.spreadsheet', ['ods']],
  ['application/vnd.oasis.opendocument.presentation', ['odp']],
  ['application/msword', ['doc']],
  ['application/vnd.ms-excel', ['xls']],
  ['application/vnd.ms-powerpoint', ['ppt']],
  ['application/rtf', ['rtf']],
  ['application/epub+zip', ['epub']],
  ['application/x-msdownload', ['exe']],
  ['application/x-sqlite3', ['sqlite']],
  ['audio/mpeg', ['mp3']],
  ['audio/wav', ['wav']],
  ['audio/ogg', ['ogg']],
  ['audio/mp4', ['m4a']],
  ['audio/flac', ['flac']],
  ['video/mp4', ['mp4']],
  ['video/webm', ['webm']],
  ['video/quicktime', ['mov']],
  ['video/x-matroska', ['mkv']],
  ['text/csv', ['csv']],
  ['text/tab-separated-values', ['tsv']],
  ['text/plain', ['txt']],
  ['text/markdown', ['md']],
  ['application/json', ['json']],
  ['application/octet-stream', ['bin']],
]

export const octetStream = 'application/octet-stream'

/** Text formats a name's extension may give text content, which magic bytes cannot tell apart. */
export const textTypes = new Set(['text/csv', 'text/tab-separated-values', 'text/plain', 'text/markdown', 'application/json'])

// Shown in the browser, never run: raster images, PDF, audio and video. SVG can carry scripts, so it is an attachment.
const inlineTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'application/pdf'])

/** The last dot's extension of a name, lower-cased; `undefined` without one. */
export const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot <= 0 || dot === name.length - 1 ? undefined : name.slice(dot + 1).toLowerCase()
}

// A type as RFC 6838 writes one, such as `application/vnd.example.report+json`.
const typePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/
// An extension without its leading dot, which may hold dots of its own: `report.json`.
const extensionPattern = /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)*$/

// The app's own types, refused when one is malformed, claims a type or extension the built-in table has, or shares an
// extension with another.
const checkedCustom = (custom: Readonly<Record<string, readonly string[]>>, builtIn: ReadonlyMap<string, string>, builtInTypes: ReadonlySet<string>) => {
  const claimed = new Map<string, string>()
  for (const [type, extensions] of Object.entries(custom)) {
    if (!typePattern.test(type)) throw new Error(`files.types: "${type}" is not a media type such as application/vnd.example.report+json`)
    if (builtInTypes.has(type)) throw new Error(`files.types: ${type} is built in; leave it out`)
    if (extensions.length === 0) throw new Error(`files.types: ${type} needs at least one extension, such as 'report.json'`)
    for (const extension of extensions) {
      if (!extensionPattern.test(extension)) throw new Error(`files.types: "${extension}" of ${type} is not a lower-case extension without its leading dot, such as 'report.json'`)
      if (builtIn.has(extension)) throw new Error(`files.types: the extension ${extension} of ${type} is built in as ${builtIn.get(extension)}`)
      const owner = claimed.get(extension)
      if (owner !== undefined && owner !== type) throw new Error(`files.types: the extension ${extension} is given to both ${owner} and ${type}`)
      claimed.set(extension, type)
    }
  }
  return Object.entries(custom).map(([type, extensions]): [string, string[]] => [type, [...extensions]])
}

/**
 * The table between types and extensions, the built-in one plus the app's own types (`files.types`): each type and its
 * extensions, the first being the one its files are stored with. An extension may hold dots, as `report.json` does, and
 * the longest one a name ends in decides its type.
 */
export const mediaTypes = (custom: Readonly<Record<string, readonly string[]>> = {}) => {
  const builtInByExtension = new Map(table.flatMap(([type, extensions]) => extensions.map((extension): [string, string] => [extension, type])))
  const own = checkedCustom(custom, builtInByExtension, new Set(table.map(([type]) => type)))
  const all = [...table, ...own]
  const byExtension = new Map(all.flatMap(([type, extensions]) => extensions.map((extension): [string, string] => [extension, type])))
  const byType = new Map(all.map(([type, extensions]) => [type, extensions[0]!]))
  const customTypes = new Set(own.map(([type]) => type))
  // Longest first, so `report.json` wins over `json`.
  const compound = [...byExtension.keys()].filter((extension) => extension.includes('.')).sort((a, b) => b.length - a.length)

  /** The extension of a name the table knows: its longest known compound one, else the last dot's. */
  const knownExtension = (name: string) => {
    const base = name.slice(name.lastIndexOf('/') + 1).toLowerCase()
    return compound.find((extension) => base.endsWith(`.${extension}`) && base.length > extension.length + 1) ?? extensionOf(name)
  }

  /** The type of a name or path, from its extension; `undefined` for an extension the table does not know. */
  const typeOfExtension = (name: string) => {
    const extension = knownExtension(name)
    return extension === undefined ? undefined : byExtension.get(extension)
  }

  /** The type a stored path is served as. */
  const servedType = (path: string) => typeOfExtension(path) ?? octetStream

  /** The canonical extension of a type the table knows. */
  const canonicalExtension = (type: string) => byType.get(type)

  const isKnownType = (type: string) => byType.has(type)

  /** One of the app's own types, which a file whose bytes no magic number names takes from its name's extension. */
  const isCustom = (type: string) => customTypes.has(type)

  /** The uploader's name with its extension made to match the stored type: `photo.png` holding a JPEG downloads as `photo.jpg`. */
  const downloadName = (name: string, type: string) => {
    const canonical = canonicalExtension(type)
    if (!canonical || type === octetStream) return name
    const known = typeOfExtension(name)
    if (known === type) return name
    const extension = knownExtension(name)
    const stem = extension !== undefined && known !== undefined ? name.slice(0, -extension.length - 1) : name
    return `${stem}.${canonical}`
  }

  return { typeOfExtension, servedType, canonicalExtension, isKnownType, isCustom, downloadName }
}

/** The table between types and extensions an app works with (see `mediaTypes`). */
export type MediaTypes = ReturnType<typeof mediaTypes>

/** The built-in table alone, for what no app's types change, such as an image's variants. */
export const builtInTypes = mediaTypes()

export const { typeOfExtension, servedType, canonicalExtension, isKnownType, downloadName } = builtInTypes

export const isInline = (type: string) => inlineTypes.has(type) || type.startsWith('audio/') || type.startsWith('video/')

/** `inline` for types shown in the browser, else `attachment`, named `name` in ASCII and in UTF-8. */
export const contentDisposition = (name: string, type: string) => {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_')
  return `${isInline(type) ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/** Whether `type` passes a field's allowed list: exact types, `type/*` wildcards, `*\/*`; an empty list allows any. */
export const accepts = (allowed: readonly string[], type: string) =>
  allowed.length === 0 || allowed.some((entry) => entry === '*/*' || entry === type || (entry.endsWith('/*') && type.startsWith(entry.slice(0, -1))))
