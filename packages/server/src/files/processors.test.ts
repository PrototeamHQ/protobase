import { describe, expect, it } from 'vitest'
import { aspectRatio, fileSize, fileType, imageSize } from './processors'
import { jpeg, pdf, png } from './testing/samples'

const input = (head: Uint8Array<ArrayBuffer>, type: string) => ({ name: 'x', type, size: 1234, head, read: async () => new Blob([head]).stream() })

// A JPEG whose EXIF data says to turn it a quarter (orientation 6)
const rotated = (() => {
  const exif = [
    ...[0x45, 0x78, 0x69, 0x66, 0x00, 0x00], // Exif\0\0
    ...[0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08], // big-endian TIFF header, first IFD at 8
    ...[0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00], // one entry: Orientation = 6
    ...[0x00, 0x00, 0x00, 0x00],
  ]
  const app1 = [0xff, 0xe1, 0x00, exif.length + 2, ...exif]
  return new Uint8Array([0xff, 0xd8, ...app1, ...jpeg.slice(2)])
})()

describe('processors', () => {
  it('measure images from their header, as shown', async () => {
    expect(await imageSize('width').run(input(jpeg, 'image/jpeg'))).toBe(6000)
    expect(await imageSize('height').run(input(jpeg, 'image/jpeg'))).toBe(4000)
    expect(await aspectRatio().run(input(jpeg, 'image/jpeg'))).toBe('1.5000')
    expect(await aspectRatio({ decimals: 2 }).run(input(png, 'image/png'))).toBe('1.00')
    expect(await imageSize('width').run(input(rotated, 'image/jpeg'))).toBe(4000)
    expect(await aspectRatio().run(input(rotated, 'image/jpeg'))).toBe('0.6667')
  })

  it('leave a value out for what they cannot read, and say which types they handle', async () => {
    expect(await imageSize('width').run(input(jpeg.slice(0, 10), 'image/jpeg'))).toBeNull()
    expect(await aspectRatio().run(input(pdf, 'image/png'))).toBeNull()
    expect(imageSize('width').accepts).toEqual(['image/*'])
  })

  it('give the size and type of any file', async () => {
    expect(await fileSize().run(input(pdf, 'application/pdf'))).toBe(1234)
    expect(await fileType().run(input(pdf, 'application/pdf'))).toBe('application/pdf')
    expect(fileSize().accepts).toBeUndefined()
  })
})
