import type { JwtVerifyOptions } from '../auth/jwt'
import type { AdminAuth } from '../better-auth/create-auth'
import { cachedKeys, type JwksCacheOptions } from '../better-auth/jwks-cache'
import { goTrueAlgorithm, goTrueAudience, goTrueIssuer, goTrueKeys } from './keys'

/**
 * How the tokens of the GoTrue-compatible endpoints verify, read from the auth instance: for `jwtVerifier`, such as
 * `apiKeyCaller({ keys, verify: jwtVerifier(goTrueTokens({ auth })) })`.
 */
export const goTrueTokens = ({ auth, cache }: { auth: AdminAuth; cache?: JwksCacheOptions }) => ({
  keys: cachedKeys(async () => goTrueKeys(await auth.api.getJwks()), cache),
  issuer: goTrueIssuer(auth.issuer),
  audience: goTrueAudience,
  algorithms: [goTrueAlgorithm],
}) satisfies JwtVerifyOptions
