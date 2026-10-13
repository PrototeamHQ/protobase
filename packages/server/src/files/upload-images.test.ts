import type { FileFieldModel } from '@protobase/schema'
import { describe, expect, it } from 'vitest'
import { plannedVariants, processesImage, storedPath } from './upload-images'

const plain: FileFieldModel = { accept: ['image/*'], maxSize: 1000, provider: 'public' }
const resized: FileFieldModel = {
  ...plain,
  placeholder: 'photo_placeholder',
  variants: { card: { width: 640, height: 480, fit: 'cover', format: 'webp' }, thumb: { width: 96, format: 'avif' } },
  original: { width: 2560, format: 'jpeg' },
}
const jpeg = { type: 'image/jpeg', extension: 'jpg' }
const png = { type: 'image/png', extension: 'png' }

describe('image uploads', () => {
  it('process the images sharp reads, of a field that declares variants, an original or a placeholder', () => {
    expect(processesImage(resized, 'image/jpeg')).toBe(true)
    expect(processesImage({ ...plain, placeholder: 'p' }, 'image/webp')).toBe(true)
    expect(processesImage(plain, 'image/jpeg')).toBe(false)
    expect(processesImage(resized, 'image/svg+xml')).toBe(false)
    expect(processesImage(resized, 'image/heic')).toBe(false)
    expect(processesImage(resized, 'application/pdf')).toBe(false)
  })

  it('store an image the field replaces with the extension of its new format, anything else as uploaded', () => {
    expect(storedPath(resized, '_/2992db9c', png)).toBe('_/2992db9c.jpg')
    expect(storedPath(resized, '_/2992db9c', { type: 'application/pdf', extension: 'pdf' })).toBe('_/2992db9c.pdf')
    expect(storedPath(plain, '_/2992db9c', png)).toBe('_/2992db9c.png')
  })

  it('name each variant with the extension of its format, and none for other files', () => {
    expect(plannedVariants(resized, jpeg.type)).toEqual({ card: 'webp', thumb: 'avif' })
    expect(plannedVariants(resized, 'application/pdf')).toEqual({})
    expect(plannedVariants({ ...plain, placeholder: 'p' }, jpeg.type)).toEqual({})
  })
})
