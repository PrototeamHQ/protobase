import { describe, expect, it } from 'vitest'
import { appReadUrl, isAppRead, storedFileRef } from './app-read'

describe('appReadUrl', () => {
  it('adds the app read to a signed link and to a bare one', () => {
    expect(appReadUrl('/api/files/private/1/a.json?r=docs&sig=x')).toBe('/api/files/private/1/a.json?r=docs&sig=x&via=app')
    expect(appReadUrl('/api/files/public/_/a.json')).toBe('/api/files/public/_/a.json?via=app')
  })

  it('is what isAppRead recognises', () => {
    expect(isAppRead(new URL(appReadUrl('https://app.test/api/files/private/a.json?sig=x')).searchParams)).toBe(true)
    expect(isAppRead(new URLSearchParams('sig=x'))).toBe(false)
    expect(isAppRead(new URLSearchParams('via=bucket'))).toBe(false)
  })
})

describe('storedFileRef', () => {
  it('reads the provider and path of a stored value, and nothing from a URL', () => {
    expect(storedFileRef('private:1/a.json?name=a.json&size=2')).toEqual({ provider: 'private', path: '1/a.json' })
    expect(storedFileRef('public:_/b.png')).toEqual({ provider: 'public', path: '_/b.png' })
    expect(storedFileRef('https://example.com/a.json')).toBeUndefined()
  })
})
