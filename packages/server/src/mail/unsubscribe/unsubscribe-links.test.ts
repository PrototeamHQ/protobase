import { describe, expect, it } from 'vitest'
import { unsubscribeLinks } from './unsubscribe-links'

const linkOn = (appUrl: string) => unsubscribeLinks({ appUrl, path: '/api/unsubscribe', secret: 'test secret' }).url({ recipient: 'ada@example.com', topic: 'news' })

describe('unsubscribe links', () => {
  it("keep the path of the app's URL", () => {
    expect(linkOn('https://shop.example.com')).toMatch(/^https:\/\/shop\.example\.com\/api\/unsubscribe\/[\w-]+\.[\w-]+$/)
    expect(linkOn('https://shop.example.com/')).toMatch(/^https:\/\/shop\.example\.com\/api\/unsubscribe\//)
    expect(linkOn('https://example.com/shop/')).toMatch(/^https:\/\/example\.com\/shop\/api\/unsubscribe\//)
  })

  it('are refused on an http URL, but on loopback for development', () => {
    expect(() => linkOn('http://shop.example.com')).toThrow(/unsubscribe links must be https: set url .* not http:\/\/shop\.example\.com/)
    expect(linkOn('http://localhost:5173')).toMatch(/^http:\/\/localhost:5173\/api\/unsubscribe\//)
    expect(linkOn('http://127.0.0.1:3000')).toMatch(/^http:\/\/127\.0\.0\.1:3000\//)
  })
})
