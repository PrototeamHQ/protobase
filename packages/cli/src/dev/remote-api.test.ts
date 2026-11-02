import { describe, expect, it } from 'vitest'
import { remoteApiOrigin } from './remote-api'

describe('remoteApiOrigin', () => {
  it("takes an instance's http or https origin", () => {
    expect(remoteApiOrigin('https://app.example.com')).toBe('https://app.example.com')
    expect(remoteApiOrigin('https://app.example.com/')).toBe('https://app.example.com')
    expect(remoteApiOrigin('http://localhost:5173')).toBe('http://localhost:5173')
  })

  it('refuses what is not an http or https URL, or has a path', () => {
    expect(() => remoteApiOrigin('app.example.com')).toThrow('--api expects an http or https URL')
    expect(() => remoteApiOrigin('ftp://app.example.com')).toThrow('--api expects an http or https URL')
    expect(() => remoteApiOrigin('https://app.example.com/api/v1')).toThrow('without a path')
  })
})
