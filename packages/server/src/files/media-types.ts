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

const byExtension = new Map(table.flatMap(([type, extensions]) => extensions.map((extension): [string, string] => [extension, type])))
const byType = new Map(table.map(([type, extensions]) => [type, extensions[0]!]))

/** Text formats a name's extension may give text content, which magic bytes cannot tell apart. */
export const textTypes = new Set(['text/csv', 'text/tab-separated-values', 'text/plain', 'text/markdown', 'application/json'])

// Shown in the browser, never run: raster images, PDF, audio and video. SVG can carry scripts, so it is an attachment.
const inlineTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'application/pdf'])

export const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot <= 0 || dot === name.length - 1 ? undefined : name.slice(dot + 1).toLowerCase()
}

/** The type of a name or path, from its extension; `undefined` for an extension the table does not know. */
export const typeOfExtension = (name: string) => {
  const extension = extensionOf(name)
  return extension === undefined ? undefined : byExtension.get(extension)
}

/** The type a stored path is served as. */
export const servedType = (path: string) => typeOfExtension(path) ?? octetStream

/** The canonical extension of a type the table knows. */
export const canonicalExtension = (type: string) => byType.get(type)

export const isKnownType = (type: string) => byType.has(type)

export const isInline = (type: string) => inlineTypes.has(type) || type.startsWith('audio/') || type.startsWith('video/')

/** Whether `type` passes a field's allowed list: exact types, `type/*` wildcards, `*\/*`; an empty list allows any. */
export const accepts = (allowed: readonly string[], type: string) =>
  allowed.length === 0 || allowed.some((entry) => entry === '*/*' || entry === type || (entry.endsWith('/*') && type.startsWith(entry.slice(0, -1))))

/** The uploader's name with its extension made to match the stored type: `photo.png` holding a JPEG downloads as `photo.jpg`. */
export const downloadName = (name: string, type: string) => {
  const canonical = canonicalExtension(type)
  if (!canonical || type === octetStream) return name
  const known = typeOfExtension(name)
  if (known === type) return name
  const extension = extensionOf(name)
  const stem = extension !== undefined && known !== undefined ? name.slice(0, -extension.length - 1) : name
  return `${stem}.${canonical}`
}
