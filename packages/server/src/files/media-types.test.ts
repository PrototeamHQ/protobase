import { describe, expect, it } from 'vitest'
import { accepts, canonicalExtension, downloadName, isInline, mediaTypes, servedType } from './media-types'

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

  it("serve the app's own types by their longest extension, stored with the first", () => {
    const types = mediaTypes({ 'application/vnd.example.report+json': ['report.json', 'rpt'] })
    expect(types.servedType('acme/x.report.json')).toBe('application/vnd.example.report+json')
    expect(types.servedType('acme/x.RPT')).toBe('application/vnd.example.report+json')
    expect(types.servedType('acme/x.json')).toBe('application/json')
    expect(types.servedType('acme/.report.json')).toBe('application/json')
    expect(types.canonicalExtension('application/vnd.example.report+json')).toBe('report.json')
    expect(types.downloadName('weekly.report.json', 'application/vnd.example.report+json')).toBe('weekly.report.json')
    expect(types.downloadName('weekly.json', 'application/vnd.example.report+json')).toBe('weekly.report.json')
    expect(servedType('acme/x.report.json')).toBe('application/json')
  })

  it("refuse an app's type that is malformed, built in or without extensions, and a built-in extension", () => {
    expect(() => mediaTypes({ report: ['report.json'] })).toThrow('is not a media type')
    expect(() => mediaTypes({ 'application/json': ['data.json'] })).toThrow('is built in')
    expect(() => mediaTypes({ 'application/vnd.example.report+json': [] })).toThrow('at least one extension')
    expect(() => mediaTypes({ 'application/vnd.example.report+json': ['json'] })).toThrow('is built in as application/json')
    expect(() => mediaTypes({ 'application/vnd.example.report+json': ['.report.json'] })).toThrow('without its leading dot')
  })
})
