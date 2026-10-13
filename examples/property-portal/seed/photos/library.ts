import path from 'node:path'
import sharp from 'sharp'
import { formatUri, renderVariant, storeFile, thumbHash, variantPath } from '@protobase/server'
import { photoVariants } from '../../config/photo-variants'
import { drawExterior, drawRoom, exteriorVariants, propertyTypes, roomKinds, roomVariants, type PropertyType, type RoomKind } from './draw'
import { encodePng } from './png'

/** Where the listing photos sit in the public file provider. */
const folder = 'listings'

/** A home's outside, or one of its rooms, by its plain `public:` URI; the library gives the value a row stores. */
export const exteriorPhoto = (type: PropertyType, variant: number) => `public:${folder}/${type}-${(variant % exteriorVariants) + 1}.png`
export const roomPhoto = (kind: RoomKind, variant: number) => `public:${folder}/${kind}-${(variant % roomVariants) + 1}.png`

/** A library photo as a row stores it: its file value, naming its variants, and its placeholder. */
export type StoredPhoto = { value: string; placeholder: string }

/**
 * Draws every photo the listings use into the public file provider, as the server resolves it from `env`: its folder,
 * `data/files/public` by default, or its bucket. The same files every run, a few dozen in all, each with the variants and
 * placeholder an upload to the photo fields would get. Answers them by their plain URI.
 */
export const writePhotoLibrary = async (env: Record<string, string | undefined>) => {
  const photos = new Map<string, StoredPhoto>()
  const write = async (uri: string, canvas: { width: number; height: number; pixels: Uint8Array }) => {
    const file = uri.slice('public:'.length)
    const png = encodePng(canvas.width, canvas.height, canvas.pixels)
    await storeFile({ provider: 'public', path: file, body: png, env })
    const variants: Record<string, string> = {}
    for (const [name, variant] of Object.entries(photoVariants)) {
      const { data, extension } = await renderVariant(sharp, png, variant)
      await storeFile({ provider: 'public', path: variantPath(file, name, extension), body: data, env })
      variants[name] = extension
    }
    photos.set(uri, { value: formatUri({ provider: 'public', path: file, name: path.basename(file), size: png.length, variants }), placeholder: await thumbHash(sharp, png) })
  }
  for (const type of propertyTypes) {
    for (let variant = 0; variant < exteriorVariants; variant++) await write(exteriorPhoto(type, variant), drawExterior(type, variant))
  }
  for (const kind of roomKinds) {
    for (let variant = 0; variant < roomVariants; variant++) await write(roomPhoto(kind, variant), drawRoom(kind, variant))
  }
  return photos
}
