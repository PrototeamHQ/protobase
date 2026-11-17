import { UnsecuredJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { deviceNameOf } from './platform-devices'

describe('deviceNameOf', () => {
  const idToken = (claims: Record<string, unknown>) => new UnsecuredJWT(claims).encode()

  it("is the device_name claim of the device's last ID token, trimmed", () => {
    expect(deviceNameOf(idToken({ sub: 'device-1', device_name: " Sanne's phone " }))).toBe("Sanne's phone")
  })

  it('is none without a token, without the claim, with an empty or other value, or for no token at all', () => {
    expect(deviceNameOf(undefined)).toBeUndefined()
    expect(deviceNameOf(null)).toBeUndefined()
    expect(deviceNameOf(idToken({ sub: 'device-1' }))).toBeUndefined()
    expect(deviceNameOf(idToken({ device_name: ' ' }))).toBeUndefined()
    expect(deviceNameOf(idToken({ device_name: 42 }))).toBeUndefined()
    expect(deviceNameOf('not a token')).toBeUndefined()
  })
})
