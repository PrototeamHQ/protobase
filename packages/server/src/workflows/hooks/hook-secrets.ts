import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { badRequest } from '../../problem'

/** How a webhook call proves it comes from the sender; anything else, such as a mode no release supports, is refused. */
export type HookMode = 'standard_webhooks' | 'hmac' | 'bearer'

const modes: readonly string[] = ['standard_webhooks', 'hmac', 'bearer']

/** The mode a webhook trigger's input names, `standard_webhooks` by default; `undefined` for one the route does not know. */
export const hookMode = (input: Record<string, unknown>): HookMode | undefined => {
  const auth = input.auth as { mode?: unknown } | undefined
  if (auth === undefined) return 'standard_webhooks'
  return typeof auth?.mode === 'string' && modes.includes(auth.mode) ? (auth.mode as HookMode) : undefined
}

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/** Whether `secret` is one this mode can check signatures with: a Standard Webhooks secret is `whsec_` and 24+ bytes in base64. */
const usable = (mode: HookMode, secret: string) => {
  if (mode !== 'standard_webhooks') return secret.length >= 32 && secret.length <= 512
  const match = /^whsec_([A-Za-z0-9+/]+={0,2})$/.exec(secret)
  return Boolean(match) && Buffer.from(match![1]!, 'base64').length >= 24 && secret.length <= 512
}

/** The secret of a new URL: the caller's, checked for its mode, or a new one of 32 random bytes. */
export const hookSecret = (mode: HookMode, given: string | undefined) => {
  if (given === undefined) return mode === 'standard_webhooks' ? `whsec_${randomBytes(32).toString('base64')}` : randomBytes(32).toString('base64url')
  if (!usable(mode, given)) throw badRequest('invalid-secret', mode === 'standard_webhooks' ? 'A standard_webhooks secret is whsec_ followed by at least 24 bytes in base64' : 'A secret is 32 to 512 characters')
  return given
}

/** Whether a stored secret is still one its mode can check with, as after the mode changed since the URL was issued. */
export const usableSecret = (mode: HookMode, secret: string | null): secret is string => secret !== null && usable(mode, secret)

/** A new URL key: 32 random bytes, which only the URL holds; the app keeps its SHA-256. */
export const hookKey = () => randomBytes(32).toString('base64url')

/** Whether a bearer token's SHA-256 is the kept one, compared in constant time on two digests of one length. */
export const bearerMatches = (token: string, secretHash: string) => {
  const given = createHash('sha256').update(token).digest()
  const kept = Buffer.from(secretHash, 'hex')
  return kept.length === given.length && timingSafeEqual(given, kept)
}
