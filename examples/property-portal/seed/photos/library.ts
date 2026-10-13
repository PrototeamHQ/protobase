import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { formatUri, renderVariant, thumbHash, variantPath } from '@protobase/server'
import { photoVariants } from '../../config/photo-variants'
import { drawExterior, drawRoom, exteriorVariants, propertyTypes, roomKinds, roomVariants, type PropertyType, type RoomKind } from './draw'
import { encodePng } from './png'

/** Where the listing photos sit in the public file provider. */
const folder = 'listings'

/** A home's outside, or one of its rooms, by its plain `public:` URI; the library gives the value a row stores. */
export const exteriorPhoto = (type: PropertyType, variant: number) => `public:${folder}/${type}-${(variant % exteriorVariants) + 1}.png`
export const roomPhoto = (kind: RoomKind, variant: number) => `public:${folder}/${kind}-${(variant % roomVariants) + 1}.png`

/**
 * The public provider's folder, as the server finds it: `PROTOBASE_FILES_PUBLIC` when it is a file:// URL, otherwise
 * `data/files/public` in the directory the server runs in, this example's.
 */
export const publicFolder = () => {
  const configured = process.env.PROTOBASE_FILES_PUBLIC
  if (configured) return fileURLToPath(new URL(configured.split('?')[0]!))
  return path.join(process.cwd(), 'data', 'files', 'public')
}

/** A library photo as a row stores it: its file value, naming its variants, and its placeholder. */
export type StoredPhoto = { value: string; placeholder: string }

/**
 * Draws every photo the listings use into the public provider's folder, the same files every run, a few dozen in all,
 * each with the variants and placeholder an upload to the photo fields would get. Answers them by their plain URI.
 */
export const writePhotoLibrary = async (root = publicFolder()) => {
  const directory = path.join(root, folder)
  await mkdir(directory, { recursive: true })
  const photos = new Map<string, StoredPhoto>()
  const write = async (uri: string, canvas: { width: number; height: number; pixels: Uint8Array }) => {
    const file = uri.slice('public:'.length)
    const png = encodePng(canvas.width, canvas.height, canvas.pixels)
    await writeFile(path.join(root, file), png)
    const variants: Record<string, string> = {}
    for (const [name, variant] of Object.entries(photoVariants)) {
      const { data, extension } = await renderVariant(sharp, png, variant)
      await writeFile(path.join(root, variantPath(file, name, extension)), data)
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
  return { directory, photos }
}
