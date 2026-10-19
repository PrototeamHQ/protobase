import type { StoredFile, UploadResult } from '@protobase/client'
import type { FieldModel } from '@protobase/schema'
import { text } from './messages'

/** A file uploaded in the form and not yet saved: the ticket the save sends, and a local preview while there is one. */
export type FileDraft = { uploaded: UploadResult; preview?: string }

export const isStoredFile = (value: unknown): value is StoredFile =>
  typeof value === 'object' && value !== null && typeof (value as { uri?: unknown }).uri === 'string'

export const isFileDraft = (value: unknown): value is FileDraft =>
  typeof value === 'object' && value !== null && typeof (value as { uploaded?: { value?: unknown } }).uploaded?.value === 'string'

/** What a file field shows: its name, type and size, whether stored or just uploaded; `undefined` when empty. */
export const fileShown = (value: unknown) => {
  if (isFileDraft(value)) return { ...value.uploaded.file, ...(value.preview && { url: value.preview }), corrected: value.uploaded.corrected }
  if (!isStoredFile(value)) return undefined
  if ('missing' in value) return { name: text('fileMissing'), type: '', missing: true as const }
  return value
}

const units = ['bytes', 'kB', 'MB', 'GB']

/** `48 kB`, `1.2 MB`: decimal units, like the field's `maxSize`. */
export const formatSize = (bytes: number) => {
  let size = bytes
  let unit = 0
  while (size >= 1000 && unit < units.length - 1) {
    size /= 1000
    unit += 1
  }
  return unit === 0 ? `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}` : `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`
}

/** Raster images the browser shows; SVG is never shown, since it can carry scripts. */
export const isPreviewable = (type: string) => type.startsWith('image/') && type !== 'image/svg+xml'

/** Where a picture is drawn, in CSS pixels. */
export type ImageBox = { width: number; height: number }

// An image for a box needs this many pixels per CSS pixel to stay sharp on a high-density screen.
const density = 2
// A side a variant leaves unbounded counts as larger than any image.
const unbounded = 100_000

type Variant = { url: string; width?: number; height?: number }

const covers = (variant: Variant, box: ImageBox) =>
  (variant.width !== undefined || variant.height !== undefined) &&
  (variant.width ?? unbounded) >= box.width * density &&
  (variant.height ?? unbounded) >= box.height * density

const area = (variant: Variant) => (variant.width ?? unbounded) * (variant.height ?? unbounded)

/**
 * The picture of a file for `box`: the link of its smallest variant large enough for it, else the file's own, with its
 * placeholder; `undefined` for a file that is no raster image with a link.
 */
export const shownImage = (value: unknown, box: ImageBox) => {
  const file = fileShown(value)
  if (!file || 'missing' in file || !file.url || !isPreviewable(file.type)) return undefined
  const variants: Variant[] = 'variants' in file && file.variants ? Object.values(file.variants) : []
  const best = variants.filter((variant) => covers(variant, box)).sort((a, b) => area(a) - area(b))[0]
  return { url: best?.url ?? file.url, ...('placeholder' in file && file.placeholder !== undefined && { placeholder: file.placeholder }) }
}

/** The file input's `accept`: the field's allowed types, or nothing when it takes any. */
export const acceptOf = (field: FieldModel) => {
  const accept = field.file?.accept ?? []
  return accept.length === 0 || accept.includes('*/*') ? undefined : accept.join(',')
}

/** What a save sends for a file field: the ticket of a new upload, `null` to clear it, the stored URI to keep it. */
export const filePatchValue = (draft: unknown) => {
  if (isFileDraft(draft)) return draft.uploaded.value
  if (isStoredFile(draft)) return draft.uri
  return null
}

/** Whether a file field's draft changes what is stored. */
export const fileDiffers = (draft: unknown, stored: unknown) => {
  if (isFileDraft(draft)) return true
  const uri = (value: unknown) => (isStoredFile(value) ? value.uri : null)
  return uri(draft) !== uri(stored)
}
