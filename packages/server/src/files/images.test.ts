import sharp from 'sharp'
import { thumbHashToApproximateAspectRatio, thumbHashToAverageRGBA } from 'thumbhash'
import { describe, expect, it } from 'vitest'
import { renderVariant, thumbHash } from './images'

// A 300×200 blue JPEG whose EXIF data says to turn it a quarter (orientation 6), so it is shown 200×300.
const turned = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#2050c0' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer()

const sizeOf = async (data: Uint8Array) => {
  const { width, height, format } = await sharp(data).metadata()
  return { width, height, format }
}

describe('image variants', () => {
  it('fit inside their box, upright, in their format, and are never enlarged', async () => {
    const card = await renderVariant(sharp, turned, { width: 100, height: 100, format: 'webp', quality: 70 })
    expect(card.extension).toBe('webp')
    expect(await sizeOf(card.data)).toEqual({ width: 67, height: 100, format: 'webp' })
    const large = await renderVariant(sharp, turned, { width: 1000, format: 'jpeg' })
    expect(large.extension).toBe('jpg')
    expect(await sizeOf(large.data)).toEqual({ width: 200, height: 300, format: 'jpeg' })
  })

  it('fill their box and crop the rest with fit cover', async () => {
    const square = await renderVariant(sharp, turned, { width: 64, height: 64, fit: 'cover', format: 'avif' })
    expect(square.extension).toBe('avif')
    expect(await sizeOf(square.data)).toEqual({ width: 64, height: 64, format: 'heif' })
  })

  it('re-encode without resizing when they name no bounds, and keep no orientation to apply twice', async () => {
    const png = await renderVariant(sharp, turned, { format: 'png' })
    expect(await sizeOf(png.data)).toEqual({ width: 200, height: 300, format: 'png' })
    expect((await sharp(png.data).metadata()).orientation).toBeUndefined()
  })
})

describe('thumbHash', () => {
  it('encodes the upright shape and colours in a short base64 text', async () => {
    const hash = await thumbHash(sharp, turned)
    expect(hash).toMatch(/^[A-Za-z0-9+/]{20,60}={0,2}$/)
    const bytes = Uint8Array.from(atob(hash), (char) => char.charCodeAt(0))
    expect(thumbHashToApproximateAspectRatio(bytes)).toBeCloseTo(2 / 3, 1)
    const { r, g, b } = thumbHashToAverageRGBA(bytes)
    expect(b).toBeGreaterThan(r)
    expect(b).toBeGreaterThan(g)
  })
})
