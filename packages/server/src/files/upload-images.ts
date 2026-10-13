import type { FileFieldModel } from '@protobase/schema'
import { formatExtensions, processableImages, renderVariant, thumbHash, type Sharp } from './images'
import type { FileStore } from './store'
import { variantPath } from './uri'

/** Whether an upload of `type` is an image this field processes: it declares variants, an original or a placeholder, and sharp reads the type. */
export const processesImage = (file: FileFieldModel, type: string) =>
  processableImages.has(type) && (file.variants !== undefined || file.original !== undefined || file.placeholder !== undefined)

/** The path the field's file is stored at: `<base>.<extension>`, with the original's format when an image replaces the upload. */
export const storedPath = (file: FileFieldModel, base: string, decision: { type: string; extension: string }) =>
  file.original && processesImage(file, decision.type) ? `${base}.${formatExtensions[file.original.format]}` : `${base}.${decision.extension}`

/** The extension of each variant an image of `type` gets, by name; none for other files. */
export const plannedVariants = (file: FileFieldModel, type: string): Record<string, string> =>
  processesImage(file, type) ? Object.fromEntries(Object.entries(file.variants ?? {}).map(([name, variant]) => [name, formatExtensions[variant.format]])) : {}

const streamOf = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })

export type ImageUpload = { sharp: Sharp; store: FileStore; file: FileFieldModel; uploaded: string; path: string }

/**
 * Makes what an image field declares from the upload stored at `uploaded`: the image replacing it at `path` (the
 * upload is then deleted), each variant beside `path`, and the ThumbHash. Answers the replacing image's bytes, if any.
 */
export const processImage = async ({ sharp, store, file, uploaded, path }: ImageUpload) => {
  const body = await store.read(uploaded)
  if (!body) throw new Error(`The upload ${uploaded} is gone from its store`)
  const input = new Uint8Array(await new Response(body).arrayBuffer())
  let replaced: { data: Uint8Array; size: number } | undefined
  if (file.original) {
    const { data } = await renderVariant(sharp, input, file.original)
    replaced = { data, size: (await store.put(path, streamOf(data))).size }
    if (path !== uploaded) await store.delete(uploaded)
  }
  for (const [name, variant] of Object.entries(file.variants ?? {})) {
    const { data, extension } = await renderVariant(sharp, input, variant)
    await store.put(variantPath(path, name, extension), streamOf(data))
  }
  const placeholder = file.placeholder === undefined ? undefined : await thumbHash(sharp, input)
  return { replaced, placeholder }
}
