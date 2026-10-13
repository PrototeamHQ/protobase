import type { ImageFormat, ImageVariant } from '@protobase/schema'
import { rgbaToThumbHash } from 'thumbhash'

// The calls made on an image, as sharp's types declare them, so the server needs no types of its own from sharp.
type SharpImage = {
  resize(width: number, height: number, options: { fit: 'inside' }): SharpImage
  resize(options: { width?: number; height?: number; fit: 'inside' | 'cover'; withoutEnlargement: boolean }): SharpImage
  ensureAlpha(): SharpImage
  raw(): SharpImage
  toFormat(format: ImageFormat, options: { quality?: number }): SharpImage
  toBuffer(): Promise<Uint8Array>
  toBuffer(options: { resolveWithObject: true }): Promise<{ data: Uint8Array; info: { width: number; height: number } }>
}

/** sharp's default export, as `import sharp from 'sharp'` gives it: what `files.sharp` takes. */
export type Sharp = (input: Uint8Array, options: { autoOrient: boolean }) => SharpImage

/** The types sharp reads, as uploads are decided: an image of another type, such as HEIC or SVG, is kept as it is. */
export const processableImages = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/tiff'])

/** The extension each variant format is stored with. */
export const formatExtensions: Record<ImageFormat, string> = { webp: 'webp', avif: 'avif', jpeg: 'jpg', png: 'png' }

// ThumbHash encodes at most 100×100 pixels.
const thumbHashSide = 100

/** An image's ThumbHash, base64: its shape and colours in about 25 bytes, drawn blurred while the image loads. */
export const thumbHash = async (sharp: Sharp, input: Uint8Array) => {
  const { data, info } = await sharp(input, { autoOrient: true })
    .resize(thumbHashSide, thumbHashSide, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return btoa(String.fromCharCode(...rgbaToThumbHash(info.width, info.height, data)))
}

/** An image resized and encoded as `variant` says, turned upright first; it is never enlarged and keeps no metadata. */
export const renderVariant = async (sharp: Sharp, input: Uint8Array, variant: ImageVariant) => {
  const image = sharp(input, { autoOrient: true })
  const sized = variant.width === undefined && variant.height === undefined
    ? image
    : image.resize({ width: variant.width, height: variant.height, fit: variant.fit ?? 'inside', withoutEnlargement: true })
  const data = await sized.toFormat(variant.format, variant.quality === undefined ? {} : { quality: variant.quality }).toBuffer()
  return { data, extension: formatExtensions[variant.format] }
}
