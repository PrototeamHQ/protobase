import type { BetterAuthPlugin, GenericEndpointContext } from 'better-auth'
import { createAuthEndpoint, createAuthMiddleware } from 'better-auth/api'
import { createJwk, type JwtOptions } from 'better-auth/plugins'

/**
 * How the token signing keys rotate: `signingKeyDays`, how long a key signs before a new one takes over, and
 * `signingKeyGraceDays`, how long a replaced key still verifies the tokens it signed.
 */
export type SigningKeyOptions = { signingKeyDays?: number; signingKeyGraceDays?: number }

// A month bounds how long a leaked key signs, and keeps two new rows a month (EdDSA and ES256) in the key set. A
// replaced key verifies for a week: well past the longest token it signed (a day, from `protobase token`), so an
// outage or a verifier's cache over a weekend never refuses one.
export const defaultSigningKeyDays = 30
export const defaultSigningKeyGraceDays = 7

const daySeconds = 24 * 60 * 60

/** The JWT plugin's rotation for `options`: `rotationInterval` and `gracePeriod`, in seconds. */
export const signingKeyRotation = ({ signingKeyDays = defaultSigningKeyDays, signingKeyGraceDays = defaultSigningKeyGraceDays }: SigningKeyOptions = {}) => {
  if (!(signingKeyDays > 0)) throw new Error('signingKeyDays must be more than 0')
  if (!(signingKeyGraceDays >= 1)) throw new Error('signingKeyGraceDays must be at least 1: tokens of `protobase token` last up to a day')
  return { rotationInterval: Math.round(signingKeyDays * daySeconds), gracePeriod: Math.round(signingKeyGraceDays * daySeconds) }
}

type StoredKey = { id: string; alg?: string | null; createdAt: Date; expiresAt?: Date | null }

type RotatingJwtOptions = JwtOptions & { jwks: { rotationInterval: number; gracePeriod: number } }

// Protobase's tokens are EdDSA; a key stored before keys had an algorithm is one too.
const isPrimary = (key: StoredKey) => key.alg === null || key.alg === undefined || key.alg === 'EdDSA'

// A key that stops signing within a minute is replaced now, so a token signed meanwhile never falls to an ES256 key.
const marginMs = 60_000

// The paths that sign with the primary key: the app's tokens and the MCP clients' access tokens.
const signingPaths = new Set(['/token', '/oauth2/token'])

/**
 * Keeps a live EdDSA key for the app's tokens. The JWT plugin signs with the newest live key of the primary algorithm,
 * else with the newest live key of any: once the EdDSA key expired while the ES256 one of the GoTrue-compatible
 * tokens still lived, it would sign the app's tokens ES256 until that one expired too. So before every signing, a new
 * EdDSA key is made when none lives; a key made before rotation was on (without an expiry) gets the one it would have
 * had, its creation plus the rotation interval, so it rotates too. A key past its grace period, which no longer
 * verifies, is deleted, so the store keeps a few keys (Better Auth reads at most 100). The key set is read once per
 * key's lifetime: until the newest EdDSA key expires, signing reads nothing more.
 */
export const signingKeys = (jwt: RotatingJwtOptions) => {
  const intervalMs = jwt.jwks.rotationInterval * 1000
  const graceMs = jwt.jwks.gracePeriod * 1000
  let liveUntil = 0
  let pending: Promise<void> | undefined

  const check = async (ctx: GenericEndpointContext) => {
    const now = Date.now()
    const { adapter } = ctx.context
    const stored = await adapter.findMany<StoredKey>({ model: 'jwks' })
    const dated = stored.map((key) => ({ ...key, undated: !key.expiresAt, expiresAt: key.expiresAt ?? new Date(key.createdAt.getTime() + intervalMs) }))
    const retired = dated.filter((key) => key.expiresAt.getTime() + graceMs <= now)
    if (retired.length > 0) await adapter.deleteMany({ model: 'jwks', where: [{ field: 'id', operator: 'in', value: retired.map((key) => key.id) }] })
    const keys = dated.filter((key) => !retired.includes(key))
    await Promise.all(keys.filter((key) => key.undated).map((key) => adapter.update({ model: 'jwks', where: [{ field: 'id', value: key.id }], update: { expiresAt: key.expiresAt } })))
    const live = keys.filter((key) => isPrimary(key) && key.expiresAt.getTime() - marginMs > now).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    const primary = live ?? (await createJwk(ctx, jwt))
    liveUntil = primary.expiresAt!.getTime() - marginMs
  }

  /** Makes sure a live EdDSA key signs the next token; concurrent callers share one check. */
  const ensure = async (ctx: GenericEndpointContext) => {
    if (Date.now() < liveUntil) return
    pending ??= check(ctx).finally(() => { pending = undefined })
    await pending
  }

  const plugin = {
    id: 'protobase-signing-keys',
    endpoints: {
      /** Makes sure a live EdDSA key signs the next token, for signing outside the plugin's paths (`issueToken`). */
      ensureSigningKey: createAuthEndpoint.serverOnly({ method: 'POST' }, async (ctx) => {
        await ensure(ctx)
        return ctx.json({ ok: true })
      }),
    },
    hooks: {
      before: [{ matcher: (ctx) => signingPaths.has(ctx.path ?? ''), handler: createAuthMiddleware(async (ctx) => { await ensure(ctx) }) }],
    },
  } satisfies BetterAuthPlugin

  return { plugin, ensure }
}
