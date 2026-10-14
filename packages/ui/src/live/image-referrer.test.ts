import { describe, expect, it } from 'vitest'
import { imageReferrerPolicy } from './image-referrer'

const page = 'https://app.acme.example/listings/42'
const trusted = ['files.acme.example']

describe('imageReferrerPolicy', () => {
  it("keeps the default for the page's own origin, a trusted host and a local image", () => {
    expect(imageReferrerPolicy('/api/files/private/1/a.jpg?sig=x', page, trusted)).toBeUndefined()
    expect(imageReferrerPolicy('https://app.acme.example/api/files/public/a.jpg', page, trusted)).toBeUndefined()
    expect(imageReferrerPolicy('https://files.acme.example/public/_/a.webp', page, trusted)).toBeUndefined()
    expect(imageReferrerPolicy('blob:https://app.acme.example/5b1c', page, trusted)).toBeUndefined()
    expect(imageReferrerPolicy('data:image/png;base64,AAAA', page, trusted)).toBeUndefined()
  })

  it('draws an image from any other site without a referrer', () => {
    expect(imageReferrerPolicy('https://images.example.com/listings/42.jpg', page, trusted)).toBe('no-referrer')
    // Another origin on the same host, or a subdomain of a trusted host, is another site
    expect(imageReferrerPolicy('http://app.acme.example/a.jpg', page, trusted)).toBe('no-referrer')
    expect(imageReferrerPolicy('https://app.acme.example:8443/a.jpg', page, trusted)).toBe('no-referrer')
    expect(imageReferrerPolicy('https://cdn.files.acme.example/a.jpg', page, trusted)).toBe('no-referrer')
    expect(imageReferrerPolicy('https://images.example.com/a.jpg', page, [])).toBe('no-referrer')
  })
})
