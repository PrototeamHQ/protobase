import { describe, expect, it } from 'vitest'
import { externalFile, parseExternalUrl } from './external-url'
import { parseUri } from './uri'

describe('parseExternalUrl', () => {
  it('takes an absolute https URL with a host', () => {
    expect(parseExternalUrl('https://cloud.example.com/media/208/155/043_720x480.jpg')?.hostname).toBe('cloud.example.com')
    expect(parseExternalUrl('https://images.example.com/a.jpg?width=720&fit=crop#top')?.search).toBe('?width=720&fit=crop')
    // Not a provider URI either, so stored files and URLs never overlap
    expect(parseUri('https://images.example.com/a.jpg')).toBeUndefined()
  })

  it('refuses other schemes, credentials, and text the URL parser would change', () => {
    const refused = [
      'http://images.example.com/a.jpg',
      'HTTPS://images.example.com/a.jpg',
      'https:images.example.com/a.jpg',
      'https:///a.jpg',
      'https://user@images.example.com/a.jpg',
      'https://user:secret@images.example.com/a.jpg',
      'https://images.example.com/a b.jpg',
      ' https://images.example.com/a.jpg',
      'https://images.example.com/a.jpg\n',
      'https://imagés.example.com/a.jpg',
      'private:1/a.jpg?name=a.jpg',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
    ]
    for (const value of refused) expect(parseExternalUrl(value), value).toBeUndefined()
  })
})

describe('externalFile', () => {
  it('names the file by its last path segment, typed by its extension', () => {
    expect(externalFile(new URL('https://images.example.com/listings/front%20door.JPG?w=1'))).toEqual({ name: 'front door.JPG', type: 'image/jpeg' })
    expect(externalFile(new URL('https://images.example.com/photo'))).toEqual({ name: 'photo', type: undefined })
    expect(externalFile(new URL('https://images.example.com/'))).toEqual({ name: 'images.example.com', type: undefined })
    expect(externalFile(new URL('https://images.example.com/%E0%A4%A.png'))).toEqual({ name: '%E0%A4%A.png', type: 'image/png' })
  })
})
