import { describe, expect, it } from 'vitest'
import { apiOriginOf } from './page-api-origin'

describe('apiOriginOf', () => {
  it('is undefined without a tag, and the origin of one', () => {
    expect(apiOriginOf([])).toBeUndefined()
    expect(apiOriginOf(['https://shop.example.com'])).toBe('https://shop.example.com')
    expect(apiOriginOf(['http://localhost:3000'])).toBe('http://localhost:3000')
  })

  it('refuses anything but exactly an http or https origin', () => {
    for (const value of ['https://a.com/', 'https://a.com/x', 'https://u:p@a.com', '//a.com', ' https://a.com', 'https://a.com?x', 'https://A.com', 'capacitor://localhost', 'javascript:x', '']) {
      expect(() => apiOriginOf([value]), value).toThrow('which is not an http or https origin')
    }
  })

  it('refuses two tags', () => {
    expect(() => apiOriginOf(['https://a.com', 'https://a.com'])).toThrow('The page has 2 protobase-api-origin meta tags')
  })
})
