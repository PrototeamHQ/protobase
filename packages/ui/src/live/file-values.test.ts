import { describe, expect, it } from 'vitest'
import type { FieldModel } from '@protobase/schema'
import { acceptOf, fileDiffers, filePatchValue, fileShown, formatSize, isPreviewable, shownImage } from './file-values'

const stored = { uri: 'private:1/a.png?name=a.png&size=3', name: 'a.png', type: 'image/png', size: 3, url: '/api/files/private/1/a.png?sig=x' }
const uploaded = { uploaded: { value: 'private:1/b.jpg?name=b.png&size=9&exp=1&sig=y', file: { name: 'b.png', type: 'image/jpeg', size: 9 }, derived: {}, corrected: { from: 'image/png', to: 'image/jpeg' } }, preview: 'blob:x' }

const field = (accept: string[]): FieldModel => ({ name: 'image', column: 'image', type: 'file', nullable: true, readOnly: false, filterable: false, sortable: false, aliases: [], file: { accept, maxSize: 1000, provider: 'private' } })

describe('file values', () => {
  it('show a stored file, a new upload and a missing one', () => {
    expect(fileShown(stored)).toBe(stored)
    expect(fileShown(uploaded)).toEqual({ name: 'b.png', type: 'image/jpeg', size: 9, url: 'blob:x', corrected: { from: 'image/png', to: 'image/jpeg' } })
    expect(fileShown({ uri: 'archive:x.png', missing: true })).toEqual({ name: 'File missing', type: '', missing: true })
    expect(fileShown(null)).toBeUndefined()
  })

  it('send the ticket of an upload, null to clear, and only when something changed', () => {
    expect(filePatchValue(uploaded)).toBe(uploaded.uploaded.value)
    expect(filePatchValue(null)).toBeNull()
    expect(filePatchValue(stored)).toBe(stored.uri)
    expect(fileDiffers(uploaded, stored)).toBe(true)
    expect(fileDiffers(null, stored)).toBe(true)
    expect(fileDiffers(stored, { ...stored, url: 'other' })).toBe(false)
    expect(fileDiffers(null, null)).toBe(false)
  })

  it('show the smallest variant large enough for the box, else the file, with its placeholder', () => {
    const variants = {
      thumb: { url: '/thumb.webp', type: 'image/webp', width: 96, height: 96 },
      card: { url: '/card.webp', type: 'image/webp', width: 640, height: 480 },
      wide: { url: '/wide.webp', type: 'image/webp', width: 1600 },
      unknown: { url: '/unknown.webp', type: 'image/webp' },
    }
    const photo = { ...stored, placeholder: 'YJqGPQw7sFlslqhFafSE+Q6oJ1h2iHB2Rw', variants }
    expect(shownImage(photo, { width: 20, height: 20 })).toEqual({ url: '/thumb.webp', placeholder: photo.placeholder })
    expect(shownImage(photo, { width: 320, height: 240 })).toEqual({ url: '/card.webp', placeholder: photo.placeholder })
    expect(shownImage(photo, { width: 700, height: 500 })).toEqual({ url: '/wide.webp', placeholder: photo.placeholder })
    expect(shownImage(photo, { width: 900, height: 600 })).toEqual({ url: stored.url, placeholder: photo.placeholder })
    expect(shownImage(stored, { width: 20, height: 20 })).toEqual({ url: stored.url })
    expect(shownImage(uploaded, { width: 20, height: 20 })).toEqual({ url: 'blob:x' })
    expect(shownImage({ ...stored, type: 'image/svg+xml' }, { width: 20, height: 20 })).toBeUndefined()
    expect(shownImage({ uri: 'archive:x.png', missing: true }, { width: 20, height: 20 })).toBeUndefined()
  })

  it('format sizes in decimal units', () => {
    expect(formatSize(1)).toBe('1 byte')
    expect(formatSize(999)).toBe('999 bytes')
    expect(formatSize(48_211)).toBe('48 kB')
    expect(formatSize(1_234_567)).toBe('1.2 MB')
  })

  it('preview raster images only, and pass the allowed types to the file picker', () => {
    expect(isPreviewable('image/webp')).toBe(true)
    expect(isPreviewable('image/svg+xml')).toBe(false)
    expect(isPreviewable('application/pdf')).toBe(false)
    expect(acceptOf(field(['image/*', 'application/pdf']))).toBe('image/*,application/pdf')
    expect(acceptOf(field([]))).toBeUndefined()
  })
})
