import { describe, expect, it } from 'vitest'
import { zipFiles } from '../testing/xlsx-fixture'
import { zipEntries, zipEntryStream, zipText } from './zip-reader'

const archive = async () => new Uint8Array(await (await zipFiles({ 'a.xml': '<a/>' })).arrayBuffer())

// The offset of the first record with this signature
const recordAt = (bytes: Uint8Array, signature: number) => {
  const view = new DataView(bytes.buffer)
  for (let at = 0; at < bytes.length - 4; at++) if (view.getUint32(at, true) === signature) return at
  throw new Error('No such record')
}

describe('zip reader', () => {
  it('reads an entry by its name from the central directory', async () => {
    const blob = new Blob([(await archive()) as BlobPart])
    const entries = await zipEntries(blob)
    expect(await zipText(blob, entries.get('a.xml')!)).toBe('<a/>')
  })

  it('refuses a ZIP64 archive', async () => {
    const bytes = await archive()
    new DataView(bytes.buffer).setUint16(recordAt(bytes, 0x06054b50) + 10, 0xffff, true)
    await expect(zipEntries(new Blob([bytes as BlobPart]))).rejects.toThrow('it is a ZIP64 archive')
  })

  it('names a part compressed in a way it cannot read', async () => {
    const bytes = await archive()
    // Method 12 is bzip2
    new DataView(bytes.buffer).setUint16(recordAt(bytes, 0x02014b50) + 10, 12, true)
    const blob = new Blob([bytes as BlobPart])
    const entries = await zipEntries(blob)
    await expect(zipEntryStream(blob, entries.get('a.xml')!)).rejects.toThrow("The workbook's part a.xml is compressed in a way that cannot be read (method 12)")
  })
})
