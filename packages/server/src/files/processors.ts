import { imageSize as measure } from 'image-size'
import type { FileProcessor, FileProcessorInput } from '@protobase/schema'

// The size an image is shown at, from its header: EXIF orientations 5 to 8 turn it a quarter, so width and height swap.
// An image whose header the first bytes do not hold, or a format image-size does not read, has none.
const shownSize = (head: Uint8Array) => {
  let size: ReturnType<typeof measure>
  try {
    size = measure(head)
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) return undefined
    throw error
  }
  return (size.orientation ?? 1) >= 5 ? { width: size.height, height: size.width } : { width: size.width, height: size.height }
}

/** A processor of the project's own: `processor({ accepts: ['image/*'], run: async (file) => … })`. */
export const processor = (definition: FileProcessor): FileProcessor => definition

/** An image's width or height in pixels, as shown (EXIF rotation applied), for an integer field. Null for other files. */
export const imageSize = (dimension: 'width' | 'height') =>
  processor({ accepts: ['image/*'], run: (file: FileProcessorInput) => shownSize(file.head)?.[dimension] ?? null })

/** An image's width divided by its height, as decimal text with `decimals` places (default 4), for a decimal field. */
export const aspectRatio = ({ decimals = 4 }: { decimals?: number } = {}) =>
  processor({
    accepts: ['image/*'],
    run: (file: FileProcessorInput) => {
      const size = shownSize(file.head)
      return size && size.height > 0 ? (size.width / size.height).toFixed(decimals) : null
    },
  })

/** The file's size in bytes, for an integer field to filter or sort on. */
export const fileSize = () => processor({ run: (file: FileProcessorInput) => file.size })

/** The file's detected type, for a text field to filter or sort on. */
export const fileType = () => processor({ run: (file: FileProcessorInput) => file.type })
