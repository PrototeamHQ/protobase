import { describe, expect, it } from 'vitest'
import { isSignedQueryAllowed } from './signed-query-guard'

describe('requests that may carry a signed authorization query', () => {
  it("are the connect page's, and authorize resumed", () => {
    for (const path of ['/oauth2/continue', '/oauth2/consent', '/oauth2/authorize']) expect(isSignedQueryAllowed(path)).toBe(true)
  })

  it('are never a sign-in', () => {
    for (const path of ['/sign-in/email', '/sign-in/email-otp', '/sign-in/social', '/passkey/verify-authentication', '/two-factor/verify-totp', '/oauth2/token', undefined]) {
      expect(isSignedQueryAllowed(path)).toBe(false)
    }
  })
})
