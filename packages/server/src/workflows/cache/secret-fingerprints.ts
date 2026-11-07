import { createHmac } from 'node:crypto'

/**
 * A fingerprint of each named secret's current value, so a cached result can tell which secrets changed since it was
 * kept without keeping them: an HMAC-SHA256 under a key of its own derived from the app's secret. Without an app secret
 * it keeps none, and nothing can be told.
 */
export const secretFingerprints = (secrets: Readonly<Record<string, string>>, appSecret: string | undefined) => {
  if (!appSecret) return () => ({})
  const key = createHmac('sha256', appSecret).update('protobase workflows step cache secrets').digest()
  const fingerprints = Object.fromEntries(Object.entries(secrets).map(([name, value]) => [name, createHmac('sha256', key).update(`${name}\n${value}`).digest('hex')]))
  return (names: readonly string[]): Record<string, string> => Object.fromEntries(names.flatMap((name) => (fingerprints[name] ? [[name, fingerprints[name]]] : [])))
}

/** The names whose fingerprint a kept result holds and that differ now. */
export const changedSecrets = (kept: Record<string, string>, current: Record<string, string>) => Object.keys(kept).filter((name) => current[name] !== undefined && current[name] !== kept[name]).sort()
