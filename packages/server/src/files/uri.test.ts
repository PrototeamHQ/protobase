import { describe, expect, it } from 'vitest'
import { baseOf, cleanName, formatUri, isFilePath, parseUri, tenantSegment } from './uri'

describe('file URIs', () => {
  it('round trip {provider}:{path} with the name and size in the query', () => {
    const uri = formatUri({ provider: 'private', path: 'acme/2992db9c-776e-4d4e-9e0f-59d485fefaf9.jpg', name: 'bike red.png', size: 48211 })
    expect(uri).toBe('private:acme/2992db9c-776e-4d4e-9e0f-59d485fefaf9.jpg?name=bike+red.png&size=48211')
    expect(parseUri(uri)).toEqual({ provider: 'private', path: 'acme/2992db9c-776e-4d4e-9e0f-59d485fefaf9.jpg', name: 'bike red.png', size: 48211 })
    expect(baseOf(uri)).toBe('private:acme/2992db9c-776e-4d4e-9e0f-59d485fefaf9.jpg')
  })

  it('parse a plain {provider}:{path}, named after its last segment', () => {
    expect(parseUri('public:images/test.jpg')).toEqual({ provider: 'public', path: 'images/test.jpg', name: 'test.jpg' })
  })

  it('refuse paths that climb, hide or are not a provider name', () => {
    for (const value of ['public:../etc/passwd', 'public:images/../../x', 'public:.cleanup/x.json', 'public:/abs.png', 'Public:a.png', 'public:a//b.png', 'pb://private/a.png', 'public:a.png?size=-1', 'public:a.png#x']) {
      expect(parseUri(value), value).toBeUndefined()
    }
    expect(isFilePath('a/b/c.png')).toBe(true)
    expect(isFilePath('a/.b')).toBe(false)
  })

  it('keep only a clean file name', () => {
    expect(cleanName('C:\\Users\\me\\photo.png')).toBe('photo.png')
    expect(cleanName('../../etc/passwd')).toBe('passwd')
    expect(cleanName('a\u0000b\nc.txt')).toBe('abc.txt')
    expect(cleanName('  ')).toBe('file')
    expect(cleanName(undefined)).toBe('file')
    expect(new TextEncoder().encode(cleanName('é'.repeat(300))).length).toBeLessThanOrEqual(255)
  })

  it('put an upload under its tenant, hashed when the tenant does not fit a segment', async () => {
    expect(await tenantSegment('acme')).toBe('acme')
    expect(await tenantSegment(42)).toBe('42')
    expect(await tenantSegment(undefined)).toBe('_')
    expect(await tenantSegment('Acme Corp/EU')).toMatch(/^t[0-9a-f]{32}$/)
  })
})
