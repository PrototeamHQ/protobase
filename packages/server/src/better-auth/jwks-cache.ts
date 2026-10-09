import { createLocalJWKSet, errors, type JSONWebKeySet, type JWTVerifyGetKey } from 'jose'

export type JwksCacheOptions = {
  /** Reload the whole key set this often, so removed keys stop being accepted. Default 10 minutes. */
  refreshMs?: number
  /** A token with an unknown `kid` reloads the set, but at most this often. Default 30 seconds. */
  minReloadMs?: number
}

/**
 * Key lookup for `jwtVerify` that keeps the key set in memory. It is read once, again when a token names a `kid`
 * that is not in it (a rotated key), never more often than `minReloadMs`, and every `refreshMs`.
 */
export const cachedKeys = (load: () => Promise<JSONWebKeySet>, options: JwksCacheOptions = {}): JWTVerifyGetKey => {
  const { refreshMs = 10 * 60_000, minReloadMs = 30_000 } = options
  let current: { lookup: ReturnType<typeof createLocalJWKSet>; loadedAt: number } | undefined
  let loading: Promise<NonNullable<typeof current>> | undefined

  // Concurrent callers share one read.
  const reload = () => {
    loading ??= load()
      .then((set) => (current = { lookup: createLocalJWKSet(set), loadedAt: Date.now() }))
      .finally(() => { loading = undefined })
    return loading
  }

  return async (header, token) => {
    const fresh = current && Date.now() - current.loadedAt < refreshMs ? current : await reload()
    try {
      return await fresh.lookup(header, token)
    } catch (error) {
      if (!(error instanceof errors.JWKSNoMatchingKey) || Date.now() - fresh.loadedAt < minReloadMs) throw error
      return (await reload()).lookup(header, token)
    }
  }
}
