import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { drawExterior, drawRoom, exteriorVariants, propertyTypes, roomKinds, roomVariants, type PropertyType, type RoomKind } from './draw'
import { encodePng } from './png'

/** Where the listing photos sit in the public file provider. */
const folder = 'listings'

/** The file value of a home's outside, or of one of its rooms: a plain `public:` URI, as an import writes it. */
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

/** Draws every photo the listings use into the public provider's folder: the same files every run, a few dozen in all. */
export const writePhotoLibrary = async (root = publicFolder()) => {
  const directory = path.join(root, folder)
  await mkdir(directory, { recursive: true })
  const file = (uri: string) => path.join(root, uri.slice('public:'.length))
  for (const type of propertyTypes) {
    for (let variant = 0; variant < exteriorVariants; variant++) {
      const canvas = drawExterior(type, variant)
      await writeFile(file(exteriorPhoto(type, variant)), encodePng(canvas.width, canvas.height, canvas.pixels))
    }
  }
  for (const kind of roomKinds) {
    for (let variant = 0; variant < roomVariants; variant++) {
      const canvas = drawRoom(kind, variant)
      await writeFile(file(roomPhoto(kind, variant)), encodePng(canvas.width, canvas.height, canvas.pixels))
    }
  }
  return directory
}
