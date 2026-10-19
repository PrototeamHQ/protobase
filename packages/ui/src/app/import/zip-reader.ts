
import { text as message } from './messages'

// A reader of ZIP archives (an .xlsx is one) that reads the parts of the file it needs, so a large workbook is never
// held whole: the central directory at the end, then each entry's bytes, inflated as they stream with the platform's
// DecompressionStream.

export type ZipEntry = { name: string; method: number; offset: number; size: number }

const endSignature = 0x06054b50
const entrySignature = 0x02014b50
const localSignature = 0x04034b50
// The end record is 22 bytes, followed by a comment of at most 65,535
const endSearch = 22 + 0xffff

const bytesOf = async (blob: Blob, start: number, end: number) => new DataView(await blob.slice(start, end).arrayBuffer())

const notZip = () => new Error(message('notZip'))

// The offset of the end of central directory record in `view`, searching back from the end.
const endRecordAt = (view: DataView) => {
  for (let at = view.byteLength - 22; at >= 0; at--) if (view.getUint32(at, true) === endSignature) return at
  return -1
}

/** The archive's entries by name, from its central directory. A ZIP64 archive (over 4 GB) is refused. */
export const zipEntries = async (blob: Blob) => {
  const tailStart = Math.max(0, blob.size - endSearch)
  const tail = await bytesOf(blob, tailStart, blob.size)
  const end = endRecordAt(tail)
  if (end < 0) throw notZip()
  const count = tail.getUint16(end + 10, true)
  const size = tail.getUint32(end + 12, true)
  const start = tail.getUint32(end + 16, true)
  if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) throw new Error(message('zip64'))
  const directory = await bytesOf(blob, start, start + size)
  const decoder = new TextDecoder()
  const entries = new Map<string, ZipEntry>()
  let at = 0
  for (let index = 0; index < count; index++) {
    if (directory.getUint32(at, true) !== entrySignature) throw notZip()
    const nameLength = directory.getUint16(at + 28, true)
    const extraLength = directory.getUint16(at + 30, true)
    const commentLength = directory.getUint16(at + 32, true)
    const name = decoder.decode(new Uint8Array(directory.buffer, directory.byteOffset + at + 46, nameLength))
    entries.set(name, { name, method: directory.getUint16(at + 10, true), size: directory.getUint32(at + 20, true), offset: directory.getUint32(at + 42, true) })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** The entry's content as a stream of bytes: stored as it is, or inflated (deflate). */
export const zipEntryStream = async (blob: Blob, entry: ZipEntry): Promise<ReadableStream<BufferSource>> => {
  const local = await bytesOf(blob, entry.offset, entry.offset + 30)
  if (local.getUint32(0, true) !== localSignature) throw notZip()
  const dataStart = entry.offset + 30 + local.getUint16(26, true) + local.getUint16(28, true)
  const raw = blob.slice(dataStart, dataStart + entry.size).stream()
  if (entry.method === 0) return raw
  if (entry.method === 8) return raw.pipeThrough(new DecompressionStream('deflate-raw'))
  throw new Error(message('compression', entry.name, entry.method))
}

/** The entry's content as text, decoded as UTF-8 a chunk at a time. */
export async function* zipTextChunks(blob: Blob, entry: ZipEntry) {
  const reader = (await zipEntryStream(blob, entry)).pipeThrough(new TextDecoderStream()).getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      yield value
    }
  } finally {
    await reader.cancel()
  }
}

/** The entry's whole content as text, for the small parts of a workbook. */
export const zipText = async (blob: Blob, entry: ZipEntry) => {
  const parts: string[] = []
  for await (const text of zipTextChunks(blob, entry)) parts.push(text)
  return parts.join('')
}
