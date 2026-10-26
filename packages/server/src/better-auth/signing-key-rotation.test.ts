import { describe, expect, it } from 'vitest'
import { signingKeyRotation } from './signing-keys'

describe('signingKeyRotation', () => {
  it('rotates every 30 days and verifies a replaced key for 7 more by default, in seconds', () => {
    expect(signingKeyRotation()).toEqual({ rotationInterval: 30 * 86_400, gracePeriod: 7 * 86_400 })
    expect(signingKeyRotation({ signingKeyDays: 90, signingKeyGraceDays: 2 })).toEqual({ rotationInterval: 90 * 86_400, gracePeriod: 2 * 86_400 })
  })

  it('refuses no rotation, and a grace period shorter than the longest token', () => {
    expect(() => signingKeyRotation({ signingKeyDays: 0 })).toThrow('signingKeyDays must be more than 0')
    expect(() => signingKeyRotation({ signingKeyGraceDays: 0.5 })).toThrow('signingKeyGraceDays must be at least 1')
  })
})
