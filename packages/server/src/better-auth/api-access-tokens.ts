import { decodeProtectedHeader } from 'jose'
import type { Authenticator } from '../types'

/** The `typ` of an OAuth access token's header (RFC 9068), which the app's own tokens never carry. */
export const accessTokenType = 'at+jwt'

// Whether the bearer token's header names it an OAuth access token, unverified: it only picks which authenticator verifies it.
const claimsAccessToken = (request: Request) => {
  const [scheme, token] = (request.headers.get('authorization') ?? '').split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return false
  try {
    return decodeProtectedHeader(token).typ?.toLowerCase() === accessTokenType
  } catch (error) {
    // jose refuses a token whose header does not decode with a TypeError, and with nothing else.
    if (error instanceof TypeError) return false
    throw error
  }
}

/**
 * `own` for the app's own tokens and every other credential, and `accessTokens` for a bearer token whose header names
 * it an OAuth access token. Each verifies the token in full, so a header that lies only picks a check that refuses it.
 */
export const withAccessTokens = (own: Authenticator, accessTokens: Authenticator): Authenticator => (request) => (claimsAccessToken(request) ? accessTokens(request) : own(request))
