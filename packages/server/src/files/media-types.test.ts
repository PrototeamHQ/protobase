import { describe, expect, it } from 'vitest'
import { accepts, canonicalExtension, downloadName, isInline, servedType } from './media-types'

describe('media types', () => {
  it('serve every path by its extension, unknown ones as octet streams', () => {
    expect(servedType('acme/x.jpg')).toBe('image/jpeg')
    expect(servedType('acme/x.JPEG')).toBe('image/jpeg')
    expect(servedType('acme/x.html')).toBe('application/octet-stream')
    expect(servedType('acme/x')).toBe('application/octet-stream')
    expect(canonicalExtension('image/jpeg')).toBe('jpg')
  })

  it('show only images, PDF, audio and video inline; never SVG or HTML', () => {
    expect(isInline('image/png')).toBe(true)
    expect(isInline('application/pdf')).toBe(true)
    expect(isInline('video/mp4')).toBe(true)
    expect(isInline('image/svg+xml')).toBe(false)
    expect(isInline('text/csv')).toBe(false)
  })

  it('match allowed lists with wildcards, and anything when the list is empty', () => {
    expect(accepts(['image/*'], 'image/jpeg')).toBe(true)
    expect(accepts(['image/*'], 'application/pdf')).toBe(false)
    expect(accepts(['application/pdf'], 'application/pdf')).toBe(true)
    expect(accepts(['*/*'], 'application/zip')).toBe(true)
    expect(accepts([], 'application/zip')).toBe(true)
  })

  it('give downloads a name whose extension matches the type', () => {
    expect(downloadName('photo.png', 'image/jpeg')).toBe('photo.jpg')
    expect(downloadName('photo.jpeg', 'image/jpeg')).toBe('photo.jpeg')
    expect(downloadName('scan', 'application/pdf')).toBe('scan.pdf')
    expect(downloadName('notes.v2', 'text/plain')).toBe('notes.v2.txt')
    expect(downloadName('data.xyz', 'application/octet-stream')).toBe('data.xyz')
  })
})
