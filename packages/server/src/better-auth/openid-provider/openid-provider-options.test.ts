import { describe, expect, it } from 'vitest'
import { resolveOpenIdProvider } from './openid-provider-options'

describe('resolveOpenIdProvider', () => {
  it("names the person by their id unless the subject is the grant's", () => {
    expect(resolveOpenIdProvider(true, undefined).subject).toBe('user')
    expect(resolveOpenIdProvider({ subject: 'grant' }, undefined).subject).toBe('grant')
    expect(() => resolveOpenIdProvider({ subject: 'device' as never }, undefined)).toThrow('auth.openIdProvider.subject must be user or grant, not "device"')
  })
})
