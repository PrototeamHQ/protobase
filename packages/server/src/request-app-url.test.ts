import { describe, expect, it } from 'vitest'
import { requestAppUrl } from './request-app-url'

describe('requestAppUrl', () => {
  it("puts the page on the request URL's origin, without Better Auth's base path", () => {
    expect(requestAppUrl('https://homes.example.com/api/auth', '/-/invitation')).toBe('https://homes.example.com/-/invitation')
    expect(requestAppUrl('http://localhost:5173', '/')).toBe('http://localhost:5173/')
  })
})
