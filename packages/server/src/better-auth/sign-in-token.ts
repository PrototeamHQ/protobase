import { jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'
import type { SignInRefusal } from './sign-in-enforcement'

/** The longest a token for token sign-in may live, and how long after it was issued it still signs in. */
export const signInTokenSeconds = 300

/** The clock skew allowed on `iat` and `exp`, as Better Auth allows on every ID token. */
export const clockToleranceSeconds = 30

export const invalidSignInToken: SignInRefusal = { code: 'INVALID_TOKEN', message: 'This sign-in token is not valid for this app.' }

/** How the provider's ID tokens verify, as Better Auth's generic OAuth plugin discovered them at startup. */
export type IdTokenVerification = { jwks: JWTVerifyGetKey; issuer: string; audience: string | string[]; algorithms?: string[] }

// The algorithms of a key the provider publishes: a token signed with a shared secret, or none, is never one it vouches for.
const publishedKeyAlgorithms = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512', 'EdDSA', 'Ed25519']

/** The algorithms a sign-in token may be signed with: the asymmetric ones of those the provider's discovery names. */
export const signInTokenAlgorithms = (named: string[] | undefined) => (named ? named.filter((algorithm) => publishedKeyAlgorithms.includes(algorithm)) : publishedKeyAlgorithms)

/**
 * Why a token's verified claims do not make a sign-in token, or `undefined` when they do: one audience, the app's
 * client id; a `jti` to use it once by; an address; and a life of at most `signInTokenSeconds`, issued no later than
 * now. `jwtVerify` has checked the signature, the issuer, the audience, `exp` and the token's age already.
 */
export const signInTokenProblem = (payload: JWTPayload, clientId: string, now = Date.now()) => {
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (audience.length !== 1 || audience[0] !== clientId) return 'its audience is not this app alone'
  if (typeof payload.jti !== 'string' || payload.jti === '') return 'it has no jti'
  if (typeof payload.email !== 'string' || payload.email === '') return 'it has no email'
  const { iat, exp } = payload
  if (typeof iat !== 'number' || typeof exp !== 'number') return 'it has no iat or exp'
  if (iat > now / 1000 + clockToleranceSeconds) return 'it is issued in the future'
  if (exp - iat > signInTokenSeconds) return `it lives longer than ${signInTokenSeconds} seconds`
  return undefined
}

/**
 * The claims of a sign-in token for the app at `clientId`, verified against the provider's published keys, or
 * `undefined` when it is none: see `signInTokenProblem` for what it must be besides a valid ID token.
 */
export const verifySignInToken = async (token: string, verification: IdTokenVerification, clientId: string, now = Date.now()) => {
  try {
    const { payload } = await jwtVerify(token, verification.jwks, {
      issuer: verification.issuer,
      audience: clientId,
      algorithms: signInTokenAlgorithms(verification.algorithms),
      maxTokenAge: signInTokenSeconds,
      clockTolerance: clockToleranceSeconds,
      requiredClaims: ['iss', 'sub', 'aud', 'exp', 'iat', 'jti'],
      currentDate: new Date(now),
    })
    return signInTokenProblem(payload, clientId, now) === undefined ? payload : undefined
  } catch {
    return
  }
}
