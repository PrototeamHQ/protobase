import { describe, expect, it } from 'vitest'
import { fileReadUrl } from './file-read-url'

describe('fileReadUrl', () => {
  it('reads a file linked at an API\'s files through that link', () => {
    expect(fileReadUrl({ uri: 'private:1/a.json?name=a.json', url: '/api/files/private/1/a.json?r=docs&sig=x' }, '/api')).toBe('/api/files/private/1/a.json?r=docs&sig=x&via=app')
    expect(fileReadUrl({ uri: 'private:1/a.json', url: 'https://api.test/api/files/private/1/a.json?sig=x' }, 'https://api.test/api')).toBe('https://api.test/api/files/private/1/a.json?sig=x&via=app')
  })

  it('reads a public file linked at a CDN from the API\'s own files', () => {
    expect(fileReadUrl({ uri: 'public:_/a.json?name=a.json', url: 'https://files.example.com/app/public/_/a.json' }, '/api')).toBe('/api/files/public/_/a.json?via=app')
    expect(fileReadUrl({ uri: 'public:_/a.json', url: 'https://files.example.com/_/a.json' }, 'https://api.test/api')).toBe('https://api.test/api/files/public/_/a.json?via=app')
  })

  it('reads a data link and an external URL as they are', () => {
    expect(fileReadUrl({ uri: 'private:1/a.json', url: 'data:application/json,{}' }, '/api')).toBe('data:application/json,{}')
    expect(fileReadUrl({ uri: 'https://example.com/a.json', url: 'https://example.com/a.json' }, '/api')).toBe('https://example.com/a.json')
  })
})
