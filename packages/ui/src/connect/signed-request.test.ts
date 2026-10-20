import { describe, expect, it } from 'vitest'
import { signedRequestFor } from './signed-request'

const here = { origin: 'https://admin.example.com', pathname: '/-/connect' }
const query = 'client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fcb&exp=1790000000&sig=c2ln'

describe('the request the server sends back to this page', () => {
  it('is the signed query of a URL on this page, relative or whole', () => {
    expect(signedRequestFor(`/-/connect?${query}`, here)).toBe(query)
    expect(signedRequestFor(`https://admin.example.com/-/connect?${query}`, here)).toBe(query)
  })

  it("is nothing for a client's own redirect with this page's path, on another origin or a loopback port", () => {
    expect(signedRequestFor(`https://evil.example/-/connect?${query}`, here)).toBeUndefined()
    expect(signedRequestFor(`http://127.0.0.1:4000/-/connect?${query}`, here)).toBeUndefined()
    expect(signedRequestFor(`http://admin.example.com/-/connect?${query}`, here)).toBeUndefined()
  })

  it('is nothing on this page without the signature, or on another page', () => {
    expect(signedRequestFor('/-/connect?client_id=abc&redirect_uri=x', here)).toBeUndefined()
    expect(signedRequestFor(`/-/account?${query}`, here)).toBeUndefined()
  })
})
