import { describe, expect, it } from 'vitest'
import { apnsOrigin } from './apns-hosts'

describe('apnsOrigin', () => {
  it('is the sandbox or production origin', () => {
    expect(apnsOrigin('sandbox')).toBe('https://api.sandbox.push.apple.com')
    expect(apnsOrigin('production')).toBe('https://api.push.apple.com')
  })

  it.each(['staging', '__proto__', 'constructor', 'toString', 'evil.example', 'https://evil.example', '', null, undefined, 1])('is none for %j', (environment) => {
    expect(apnsOrigin(environment)).toBeUndefined()
  })
})
