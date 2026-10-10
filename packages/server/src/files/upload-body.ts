import { HttpProblem, badRequest } from '../problem'

export const tooLarge = (maxSize: number) => new HttpProblem(413, 'file-too-large', 'Payload Too Large', `The file is larger than this field allows (${maxSize} bytes)`)

/** An upload as it arrives: its bytes, and what the request says about its name, type and size. */
export type IncomingFile = { body: ReadableStream<Uint8Array>; name?: string; declared?: string; length?: number }

// A multipart body's own overhead beyond the file: boundaries and part headers.
const multipartSlack = 64 * 1024

/**
 * The file of an upload request: the raw body with `?name=` and its Content-Type, or the one file part of a
 * `multipart/form-data` body with that part's file name and type. A multipart body is read whole, after its size is
 * checked; a raw body streams.
 */
export const incomingFile = async (request: Request, maxSize: number): Promise<IncomingFile> => {
  const header = request.headers.get('content-length')
  const length = header === null ? undefined : Number(header)
  const contentType = request.headers.get('content-type') ?? undefined
  const name = new URL(request.url).searchParams.get('name') ?? undefined
  if (!contentType?.toLowerCase().startsWith('multipart/form-data')) {
    if (length !== undefined && length > maxSize) throw tooLarge(maxSize)
    return { body: request.body ?? new Blob([]).stream(), ...(name !== undefined && { name }), ...(contentType && { declared: contentType }), ...(length !== undefined && { length }) }
  }
  if (length !== undefined && length > maxSize + multipartSlack) throw tooLarge(maxSize)
  const form = await request.formData()
  const files = [...form.values()].filter((value): value is File => typeof value !== 'string')
  if (files.length !== 1) throw badRequest('invalid-upload', `A multipart upload carries exactly one file part, not ${files.length}`)
  const file = files[0]!
  if (file.size > maxSize) throw tooLarge(maxSize)
  return { body: file.stream(), name: file.name || name, ...(file.type && { declared: file.type }), length: file.size }
}

const concat = (chunks: Uint8Array[], length: number) => {
  const joined = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.length
  }
  return joined
}

/** The first `want` bytes (or all, when there are fewer), and whether that was the whole stream. */
export const readHead = async (reader: ReadableStreamDefaultReader<Uint8Array>, want: number) => {
  const chunks: Uint8Array[] = []
  let length = 0
  while (length < want) {
    const next = await reader.read()
    if (next.done) return { head: concat(chunks, length), complete: true }
    chunks.push(next.value)
    length += next.value.length
  }
  return { head: concat(chunks, length), complete: false }
}

export class FileTooLarge extends Error {}

/** The head followed by the rest of the reader, failing with `FileTooLarge` past `maxSize` bytes. */
export const limitedStream = (head: Uint8Array, reader: ReadableStreamDefaultReader<Uint8Array>, maxSize: number) => {
  let size = head.length
  return new ReadableStream<Uint8Array>({
    start: (controller) => {
      if (head.length > 0) controller.enqueue(head)
    },
    pull: async (controller) => {
      const next = await reader.read()
      if (next.done) return controller.close()
      size += next.value.length
      if (size > maxSize) {
        await reader.cancel()
        return controller.error(new FileTooLarge())
      }
      controller.enqueue(next.value)
    },
    cancel: (reason) => reader.cancel(reason),
  })
}
