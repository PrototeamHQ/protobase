import { describe, expect, it } from 'vitest'
import { appReadUrl, isAppRead } from './app-read'

describe('appReadUrl', () => {
  it('adds the app read to a signed link and to a bare one', () => {
    expect(appReadUrl('/api/files/private/1/a.json?r=docs&sig=x')).toBe('/api/files/private/1/a.json?r=docs&sig=x&via=app')
    expect(appReadUrl('/api/files/public/_/a.json')).toBe('/api/files/public/_/a.json?via=app')
  })

  it('leaves a link with another scheme as is', () => {
    expect(appReadUrl('data:application/json,{"a":1}')).toBe('data:application/json,{"a":1}')
  })

  it('is what isAppRead recognises', () => {
    expect(isAppRead(new URL(appReadUrl('https://app.test/api/files/private/a.json?sig=x')).searchParams)).toBe(true)
    expect(isAppRead(new URLSearchParams('sig=x'))).toBe(false)
    expect(isAppRead(new URLSearchParams('via=bucket'))).toBe(false)
  })
})
