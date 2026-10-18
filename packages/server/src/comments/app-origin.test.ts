import { describe, expect, it } from 'vitest'
import { appOrigin } from './app-origin'

describe('the app origin of a request', () => {
  it("is the request's when the app is served there, else the base URL's", () => {
    const origin = appOrigin(['https://desk.example.com', 'https://desk.example.org'])
    expect(origin('https://desk.example.org/api/v1/tickets/1:comments')).toBe('https://desk.example.org')
    expect(origin('http://10.0.0.5:3000/api/v1/tickets/1:comments')).toBe('https://desk.example.com')
    expect(appOrigin([])('http://localhost:5173/api/v1/tickets/1:comments')).toBe('http://localhost:5173')
  })
})
